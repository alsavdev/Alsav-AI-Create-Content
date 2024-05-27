const puppeteer = require('puppeteer-extra');
const { executablePath } = require('puppeteer')
const stealthPlugin = require('puppeteer-extra-plugin-stealth')
puppeteer.use(stealthPlugin())
const fs = require('fs');
const path = require('path')
let stops = false
let link = [];

const mainProccess = async (logToTextArea, proggress, data) => {
    const baseURL = 'https://chat.openai.com/';
    const browser = await puppeteer.launch({
        executablePath: executablePath(),
        headless: data.visible,
        defaultViewport: null,
    })

    const page = await browser.newPage()

    page.sleep = function (timeout) {
        return new Promise(function (resolve) {
            setTimeout(resolve, timeout)
        })
    }

    async function delay(seconds) {
        await new Promise(resolve => setTimeout(resolve, seconds * 1000));
    }

    const loadCookiesGPT = async () => {
        try {
            logToTextArea('[INFO] Load Cookies')

            const cookiesData = fs.readFileSync(data.cookies, 'utf8')
            const cookies = JSON.parse(cookiesData)
            
            if (Array.isArray(cookies) && cookies.length >= 2) {
                cookies.splice(-2, 2);
            } else {
                throw new Error('Cookies data is not an array or has less than 2 elements');
            }

            await page.setCookie(...cookies);

            await page.goto(baseURL, {
                waitUntil: ['domcontentloaded', 'networkidle2'],
                timeout: 120000,
            })

            if (await page.url().includes("https://chat.openai.com/auth/login")) {
                logToTextArea("[WARNING] Something error with Cookies")
                await browser.close()
            }

            logToTextArea('[INFO] Done Load Cookies\n')
        } catch (error) {
            logToTextArea(`[ERROR] ${error}`)
            await browser.close()
            stops = true
        }
    }

    const loadCookiesWP = async (page) => {
        try {
            logToTextArea('[INFO] Load Cookies Wordpress')

            const cookiesData = fs.readFileSync(data.cookiesWp, 'utf8')
            const cookies = JSON.parse(cookiesData)

            await page.setCookie(...cookies)

            await page.goto(`https://${data.dom}/wp-admin/post-new.php`, {
                waitUntil: ['domcontentloaded', 'networkidle2'],
                timeout: 120000,
            })

            if (await page.url().includes("wp-login")) {
                logToTextArea("[WARNING] Something error with Cookies")
                await browser.close()
            }

            logToTextArea('[INFO] Done Load Cookies WordPress\n')
        } catch (error) {
            logToTextArea(error)
            throw error
        }
    }

    const coreProccess = async (keyword) => {
        var stat = await checkStat({
            page: page,
        });
        while (stat.code !== 0) {
            await sleep(500);
            stat = await checkStat({
                page: page,
            });
        }

        await page.waitForSelector('#prompt-textarea', {
            waitUntil: ['domcontentloaded', 'networkidle2'],
            timeout: 120000,
        })

        const popUp = await page.$('img[alt="GPT‑4o NUX"]')
        if (popUp) {
            await page.evaluate(() => {
                document.querySelector("#radix-\\:rq\\: > div.relative.flex.w-full.items-center.justify-center.overflow-hidden.bg-clip-content > div > button").click()
            })
        }
        
        await delay(2)
        
        logToTextArea(`[INFO] Create a Title About ${keyword} in ChatGPT`)

        let articleTitle;
        if (data.sentenceCorrection) {
            articleTitle = await editText(keyword, 1)
        } else {
            await sendChat(keyword, 1)
            articleTitle = await extractText(true)
            articleTitle = articleTitle.join('').replace(':', '')
        }

        logToTextArea('[INFO] Enter the Wordpress Page')
        const page2 = await browser.newPage()

        await loadCookiesWP(page2)

        await delay(2)

        await page2.waitForSelector('#title', {
            waitUntil: ['domcontentloaded', 'networkidle2'],
            timeout: 120000,
        })

        await page2.click('#title')
        await delay(2)

        logToTextArea('[INFO] Paste Title in Wordpress')
        await page2.$eval('#title', (textarea, value) => {
            textarea.value = value
        }, articleTitle)

        await delay(3)

        logToTextArea('[INFO] Enter the Image Page')
        const page3 = await browser.newPage();

        const imageURL = await getImages(page3, data, keyword);

        const tagIMG = await page3.evaluate((imageURL) => {
            const imageTag = `<img class="aligncenter" src="${imageURL}"/>`;
            return imageTag;
        }, imageURL);


        await page3.bringToFront()
        await page2.bringToFront()

        await delay(2)

        const buttonText = await page2.$('#content-html')
        await buttonText.click()

        await page2.waitForSelector('#content')

        await delay(2)

        logToTextArea('[INFO] Paste Image URL in Featured Image Wordpress')
        await page2.waitForSelector('#fifu_input_url')
        await page2.click('#fifu_input_url')
        await page2.$eval('#fifu_input_url', (textarea, value) => {
            textarea.value = value
        }, imageURL)

        await delay(3)

        await page2.bringToFront()
        await page.bringToFront()

        await delay(2)

        logToTextArea('[INFO] Create an Article in ChatGPT')

        await sendChat(keyword, 2, false, articleTitle)

        const articleTextBody = await extractText(false)
        
        articleTextBody.unshift('<div class="markdown prose w-full break-words dark:prose-invert light" style="text-align: justify;">');
        articleTextBody.unshift('<br>')

        const regex = /<p[^>]*>(.*?)<\/p>/g;
        let result = findTextInString(articleTextBody[2], regex);
        const lastText = result[result.length - 1].trim();

        if (lastText.includes('</p>')) {
            result[result.length - 1] = lastText.replace('</p>', ` Read more about <a href="https://${data.dom}" target="_new" rel="noopener">${keyword}</a></p>`)
        } else {
            result[result.length - 1] += ` Read more about <a href="https://${data.dom}" target="_new" rel="noopener">${keyword}</a>`
        }

        articleTextBody[2] = result.join('');
        articleTextBody.push("</div>");

        await page.bringToFront()
        await page2.bringToFront()

        await delay(2)

        await page2.click('#content')
        articleTextBody.unshift(tagIMG)

        logToTextArea('[INFO] Paste Image and Article from ChatGPT in Wordpress Body Text')
        await page2.$eval('#content', (textarea, value) => {
            textarea.value = value.join('');
        }, articleTextBody);

        await delay(2)

        logToTextArea('[INFO] Check Image and Article in Body Visual Wordpress')
        await page2.waitForSelector('#content-tmce')
        const visualButton = await page2.$('#content-tmce')
        await visualButton.click()

        await delay(3)

        logToTextArea('[INFO] Remove Site Title and Separator in Wordpress Post Title')
        await page2.waitForSelector('#aioseo-post-settings-post-title-row > div.aioseo-col.col-xs-12.col-md-9.text-xs-left > div > div.aioseo-html-tags-editor > div.aioseo-editor > div.aioseo-editor-single.ql-container.ql-snow > div.ql-editor > p')

        await page2.evaluate((articleTitle) => {
            document.querySelector('#aioseo-post-settings-post-title-row > div.aioseo-col.col-xs-12.col-md-9.text-xs-left > div > div.aioseo-html-tags-editor > div.aioseo-editor > div.aioseo-editor-single.ql-container.ql-snow > div.ql-editor > p').innerHTML = articleTitle
        }, articleTitle)

        await delay(2)

        logToTextArea('[INFO] Remove Post Excerpt in Wordpress Meta Description')
        const selectorMeta = "#aioseo-post-settings-meta-description-row > div.aioseo-col.col-xs-12.col-md-9.text-xs-left > div > div.aioseo-html-tags-editor > div.aioseo-editor > div.aioseo-editor-description.ql-container.ql-snow > div.ql-editor > p"
        await page2.waitForSelector(selectorMeta)
        const clearMetaDesc = await page2.$(selectorMeta)
        await clearMetaDesc.click()
        for (let i = 0; i < 2; i++) {
            await page2.keyboard.press('Backspace')
        }

        await delay(3)

        await page2.bringToFront()
        await page.bringToFront()

        logToTextArea('[INFO] Create a Meta Description in ChatGPT')

        let metaTag;
        if (data.sentenceCorrection) {
            metaTag = await editText(keyword, 3, articleTitle)
        } else {
            await sendChat(keyword, 3)
            metaTag = await extractText(true)
            metaTag = metaTag.join('').replace("Title:", "").replace("Meta Tag:", "").replace(':', '')
        }

        await page.bringToFront()
        await page2.bringToFront()

        logToTextArea('[INFO] Paste Meta Description in Wordpress')
        await page2.waitForSelector(selectorMeta)
        const metaField = await page2.$(selectorMeta)
        await metaField.type(metaTag)

        await delay(3)

        logToTextArea('[INFO] Select Random Category in Wordpress')
        const checkboxes = await page2.$$('[name="post_category[]"]');
        const randomIndex = Math.floor(Math.random() * checkboxes.length);
        await checkboxes[randomIndex].evaluate((e) => e.click());

        await delay(3)

        await page2.bringToFront()
        await page.bringToFront()

        logToTextArea('[INFO] Create Tags in ChatGPT')
        await sendChat(keyword, 4)

        const tagsField = await extractText(true)

        await delay(3)

        await page.bringToFront()
        await page2.bringToFront()

        logToTextArea('[INFO] Paste Tags from ChatGPT in Wordpress')
        const tagsWP = await page2.$('#new-tag-post_tag')
        await page2.evaluate(e => e.click(), tagsWP)
        await tagsWP.type(tagsField)

        await delay(3)

        logToTextArea('[INFO] Click Add Tags Button')
        await page2.waitForSelector('#post_tag > div > div.ajaxtag.hide-if-no-js > input.button.tagadd')
        await page2.evaluate(() => {
            document.querySelector("#post_tag > div > div.ajaxtag.hide-if-no-js > input.button.tagadd").click()
        })

        await delay(5)

        logToTextArea('[INFO] Click Save Post Button')
        await page2.waitForSelector('#save-post')
        await page2.evaluate(() => {
            document.getElementById("save-post").click()
        })

        await delay(15)
        const sampleLink = await page2.$('#sample-permalink > a'),
            titles = await page2.$('#editable-post-name-full')
        const permaLink = await page2.evaluate(e => e.innerHTML, sampleLink),
            links = permaLink.split('<'),
            ext = links[2].includes('.html') ? ".html" : "",
            title = await page2.evaluate(e => e.innerText, titles)

        link.push(links[0] + title + ext)
        await delay(5)

        logToTextArea('[INFO] Close Image Page and Wordpress Page\n')
        await page3.close()
        await page2.close()
    }

    const sleep = (ms) => {
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                resolve(true);
            }, ms);
        });
    };

    const checkStat = ({ page }) => {
        return new Promise(async (resolve, reject) => {
            var st = setTimeout(() => {
                resolve({
                    code: 1,
                });
            }, 2000);
            try {
                var checkStat = await page.evaluate(() => {
                    var stat = -1;
                    if (document.querySelector("html")) {
                        var html = document.querySelector("html").innerHTML;
                        html = String(html).toLowerCase();
                        if (html.indexOf("challenges.cloudflare.com/turnstile") > -1) {
                            stat = 1;
                        }
                    } else {
                        stat = 2;
                    }

                    return stat;
                });

                if (checkStat !== -1) {
                    try {
                        var frame = page.frames()[0];
                        await page.click("iframe");
                        frame = frame.childFrames()[0];
                        if (frame) {
                            await frame.hover('[type="checkbox"]').catch((err) => {});
                            await frame.click('[type="checkbox"]').catch((err) => {});
                        }
                    } catch (err) {}
                }

                var checkCloudflare = await page.evaluate(() => {
                    return document?.querySelector("html")?.innerHTML;
                });
                const checkIsBypassed = !String(checkCloudflare)?.includes(
                    "<title>Just a moment...</title>"
                );

                if (checkIsBypassed) {
                    clearInterval(st);
                    resolve({
                        code: 0,
                    });
                }
            } catch (err) {
                clearInterval(st);
                resolve({
                    code: 1,
                });
            }
        });
    };

    const editText = async (keyword, key, title) => {
        try {
            let finish = false,
                i = 0
            let textBase;

            while (!finish) {
                await page.waitForSelector('#prompt-textarea', {
                    waitUntil: ['domcontentloaded', 'networkidle2'],
                    timeout: 120000,
                })

                if ((key == 3 && i > 2) || (key == 1 && i > 2)) {
                    const newChat = await page.$('#__next > div.relative.z-0.flex.h-full.w-full.overflow-hidden > div.flex-shrink-0.overflow-x-hidden.bg-token-sidebar-surface-primary > div > div > div > div > nav > div.flex-col.flex-1.transition-opacity.duration-500.-mr-2.pr-2.overflow-y-auto > div.sticky.left-0.right-0.top-0.z-20.pt-3\\.5 > div > a')
                    await newChat.evaluate(e => e.click())

                    await page.waitForSelector('#prompt-textarea', {
                        waitUntil: ['domcontentloaded', 'networkidle2'],
                        timeout: 120000,
                    })

                    await sendChat(keyword, key, true)
                    i = 0
                } else {
                    await sendChat(keyword, key, false)
                }

                let text = await extractText(true)

                if (key == 1) {
                    text = text.join('').split('\n')
                    for (let i = 0; i < text.length; i++) {
                        const filter = text[i].replace(':', '')
                        if ((filter.length >= 50) && !(filter.length > 60)) {
                            textBase = filter;
                            finish = true;
                            break;
                        }
                    }
                } else if (key == 3) {
                    text = text.join('').split('\n')
                    for (let i = 0; i < text.length; i++) {
                        const filter = text[i].replace("Title:", "").replace("Meta Tag:", "").replace(':', '')
                        const rawText = title + " " + filter
                        if ((rawText.length >= 120) && !(rawText.length > 160)) {
                            textBase = rawText;
                            finish = true;
                            break;
                        }
                    }
                }

                i++
            }

            return textBase;
        } catch (error) {
            throw error;
        }
    }

    const sendChat = async (keyword, key, another, title) => {
        try {
            const writeGPT = await page.$('#prompt-textarea');

            if (key === 1) {
                if (data.sentenceCorrection) {
                    await writeGPT.type(`${another ? `create another 30 title maximal 60 characters about ${keyword} and remove the quotation mark at the beginning and end of the title` : `create 30 title maximal 60 characters about ${keyword} and remove the quotation mark at the beginning and end of the title` }`);
                } else {
                    await writeGPT.type('create one title maximal 60 characters about ' + keyword + ' and remove the quotation mark at the beginning and end of the title');
                }
            } else if (key === 2) {
                await writeGPT.type(`create an article with good readability with minimum 600 words about ${title} without displaying the article title. Article using tag paragraph and add a sub heading for each paragraph. Write it in a tone that is not typcal of AI and make it not include conclusion and make it not include introduction and make it not html version`);
            } else if (key === 3) {
                if (data.sentenceCorrection) {
                    await writeGPT.type(`${another ? `Create another 30 Meta Descriptions of 170 characters about ${keyword} but not the html code version and remove the quotes at the beginning and end` : `Create 30 Meta Description 170 characters about ${keyword} but not the html code version and remove the quotation marks at the beginning and end`}`)
                } else {
                    await writeGPT.type('Create Meta Description 160 characters but not html code version and add the title above in the first and remove the quotation mark at the beginning and the end');
                }
            } else if (key === 4) {
                await writeGPT.type(`Create 10 consecutive tags using commas from the ${keyword} keyword`)
            }

            await delay(2)

            // Sendchat Selector Priority maintance
            await page.click('button[data-testid="fruitjuice-send-button"]')
            await delay(3)

            try {
                await page.waitForSelector('button[data-testid="fruitjuice-send-button"][disabled]', {
                    timeout: 120000
                })
            } catch (error) {
                await checkLimit(await extractText(true), key, keyword)
            }

            await delay(3)
        } catch (error) {
            throw error;
        }
    }

    const handleImageGoogle = async (page, keyword) => {
        await page.goto("https://www.google.com/imghp?hl=en&ogbl", {
            waitUntil: ['domcontentloaded', 'networkidle2'],
            timeout: 120000,
        })

        await page.waitForSelector('[name="q"]', {
            timeout: 120000
        })
        await page.type('[name="q"]', keyword)

        await page.keyboard.press('Enter')

        await delay(3)

        let imageURL = null;

        while (imageURL == null) {
            logToTextArea('[INFO] Search for Random Images in Google Image');
            await page.waitForSelector('[data-attrid="images universal"]');
            const imageSelector = await page.$$('[data-attrid="images universal"]');
            const randomImageIndex = Math.floor(Math.random() * imageSelector.length);
            const randomImage = imageSelector[randomImageIndex];

            await randomImage.click();

            logToTextArea('[INFO] Copy Random Image URL');
            await delay(10);

            imageURL = await page.evaluate(() => {
                const imageElement = document.querySelector("#Sva75c > div.A8mJGd.NDuZHe.OGftbe-N7Eqid-H9tDt > div.LrPjRb > div.AQyBn > div.tvh9oe.BIB1wf > c-wiz > div > div > div > div > div.v6bUne > div.p7sI2.PUxBg > a > img.sFlh5c.pT0Scc.iPVvYb");
                return imageElement ? imageElement.src : null;
            });
        }

        return imageURL;
    }

    const getImages = async (page, data, keyword) => {
        try {
            if (data.googleImage) {
                return (await handleImageGoogle(page, keyword))
            } else if (data.unsplash) {
                await page.goto(`https://unsplash.com/s/photos/${keyword}?license=free&orientation=landscape`, {
                    waitUntil: ['domcontentloaded', 'networkidle2'],
                    timeout: 120000,
                })

                await delay(3)

                logToTextArea('[INFO] Search for Random Images in Unsplash Image');
                await page.waitForSelector('[data-test="page-header-title"]', {
                    timeout: 120000
                })

                const nullImage = await page.$('img[alt="No content available"]')
                const currentTitle = await page.title()
                if (nullImage || currentTitle.includes('Page not found')) {
                    logToTextArea("[WARNING] Image not found on unsplash change Mode to google Image")
                    return (await handleImageGoogle(page, keyword))
                } else {
                    const images = await page.$$('div[data-test="search-photos-route"] > div > div > div > div > div > div > div > div > div > figure > div > div > div > div > a > div > div > img')
                    const randomImages = Math.floor(Math.random() * images.length)
                    return (await page.evaluate(e => e.src, images[randomImages]));
                }
            }

        } catch (error) {
            throw error;
        }
    }

    const extractText = async (notOuter) => {
        let article = [];

        // DOCS: This selector before <ol> tag to get the <li> tag or inside the text of element
        const data = await page.$$('#__next > div.relative.z-0.flex.h-full.w-full.overflow-hidden > div > main > div.flex.h-full.flex-col > div.flex-1.overflow-hidden > div > div > div > div > div > div > div > div.relative.flex.w-full.flex-col.agent-turn > div.flex-col.gap-1.md\\:gap-3 > div.flex.flex-grow.flex-col.max-w-full > div > div');

        if (data.length > 0) {
            const last = data[data.length - 1];

            const text = await page.evaluate(el => el.innerText, last);
            await checkLimit(text);

            article = await page.evaluate((last, notOuter) => {
                const article = [];
                last.childNodes.forEach(child => {
                    if (child.nodeType === 1) {
                        const content = notOuter ? child.innerText : child.outerHTML;
                        article.push(content);
                    }
                });
                return article;
            }, last, notOuter);
        }

        article = article.map(str => str.replace(/^"|"$/g, ''));
        return article;
    };

    const checkLimit = async (dataArticle, key, keyword) => {
        if (dataArticle.includes('An error occurred. Either the engine you requested does not exist or there was another issue processing your request. If this issue persists please contact us through our help center at help.openai.com.') || dataArticle.includes('Conversation not found')) {
            stops = true
            logToTextArea("[ERROR] Something error with chatGPT")
            await browser.close()
            return;
        } else if (dataArticle.includes("You've reached our limit of messages per hour. Please try again later.")) {
            logToTextArea(`Limit Reached Wait ${data.times} mnt`)
            await new Promise(resolve => setTimeout(resolve, data.times * 60 * 1000));
            logToTextArea(`Ready after ${data.times} mnt Initiate new chat`)
            const newChat = await page.$('#__next > div.relative.z-0.flex.h-full.w-full.overflow-hidden > div.flex-shrink-0.overflow-x-hidden.bg-token-sidebar-surface-primary > div > div > div > div > nav > div.flex-col.flex-1.transition-opacity.duration-500.-mr-2.pr-2.overflow-y-auto > div.sticky.left-0.right-0.top-0.z-20.pt-3\\.5 > div > a')
            await newChat.evaluate(e => e.click())
            return;
        } else if (dataArticle.includes('An error occurred. Either the engine your requested does not exist or there was another issue proccesing your request. if the issue persists please contact us through our help center at help.openai.com')) {
            const newChat = await page.$('#__next > div.relative.z-0.flex.h-full.w-full.overflow-hidden > div.flex-shrink-0.overflow-x-hidden.bg-token-sidebar-surface-primary > div > div > div > div > nav > div.flex-col.flex-1.transition-opacity.duration-500.-mr-2.pr-2.overflow-y-auto > div.sticky.left-0.right-0.top-0.z-20.pt-3\\.5 > div > a')
            await newChat.evaluate(e => e.click())
            return;
        } else if (dataArticle.includes('Something went wrong. If this issue persists please contact us through our help center at help.openai.com.')) {
            logToTextArea("[ERROR] Something error with chatGPT")
            await delay(10)
            await browser.close()
            return;
        }
    }

    const workFlow = async () => {
        try {
            const files = fs.readFileSync(data.files, 'utf-8');
            let lines = files.split('\n').filter(line => line.trim() !== "");

            let j = 0;
            for (let i = 0; i < lines.length; i++) {
                if (stops) {
                    logToTextArea("[INFO] Stop Process is done");
                    stops = false
                    break;
                }

                let keyword = lines[i].trim();
                logToTextArea(`Article Process ${j + 1}`);
                await coreProccess(keyword);

                const countProgress = parseInt(((i + 1) / lines.length) * 100);
                proggress(countProgress);

                lines.splice(i, 1);
                i--;

                const modifiedData = lines.join('\n');
                fs.writeFileSync(data.files, modifiedData, 'utf-8');

                if (stops) {
                    logToTextArea("[INFO] Stop Process is done");
                    stops = false
                    break;
                }
                j++

            }

            await browser.close();
        } catch (error) {
            logToTextArea(error);
            await browser.close();
        }
    }

    await loadCookiesGPT()
    await workFlow()
}

function findTextInString(htmlString, regex) {
    const matches = htmlString.match(regex) || [];
    return matches;
  }

const stopProccess = (logToTextarea) => {
    return new Promise((resolve, reject) => {
        logToTextarea('[INFO] Stop Pressed waiting this proccess until done')
        resolve(stops = true)
    });
}

module.exports = {
    link,
    mainProccess,
    stopProccess
}