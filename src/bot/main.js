const puppeteer = require('puppeteer-extra');
const {
    executablePath
} = require('puppeteer')
const stealthPlugin = require('puppeteer-extra-plugin-stealth')
puppeteer.use(stealthPlugin())
const fs = require('fs');
const path = require('path')
let stops = false

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

    const loadCookies = async () => {
        try {
            logToTextArea('[INFO] Load Cookies')

            const cookiesData = fs.readFileSync(data.cookies, 'utf8')
            const cookies = JSON.parse(cookiesData)

            await page.goto(baseURL, {
                waitUntil: ['domcontentloaded', 'networkidle2'],
                timeout: 120000,
            })

            await page.setCookie(...cookies)

            await delay(10)

            //Refresh the page to apply the cookies
            await page.goto(baseURL, {
                waitUntil: ['domcontentloaded', 'networkidle2'],
                timeout: 120000,
            })

            logToTextArea('[INFO] Done Load Cookies\n')
        } catch (error) {
            logToTextArea(error)
            throw error
        }
    }

    const coreProccess = async (keyword) => {
        await page.waitForSelector('#prompt-textarea', {
            waitUntil: ['domcontentloaded', 'networkidle2'],
            timeout: 120000,
        })

        logToTextArea(`[INFO] Create a Title About ${keyword} in ChatGPT`)

        // write chtgpt
        await sendChat(keyword, 1)

        let articleTitle = await extractText(true)

        logToTextArea('[INFO] Enter the Wordpress Page')
        const targetWordpress = `https://${data.dom}/wp-admin/post-new.php`
        const page2 = await browser.newPage()
        await page2.goto(targetWordpress, {
            waitUntil: ['domcontentloaded', 'networkidle2'],
            timeout: 120000,
        })

        await delay(2)

        await page2.waitForSelector('#title')
        await page2.click('#title')
        await delay(2)

        logToTextArea('[INFO] Paste Title in Wordpress')
        await page2.$eval('#title', (textarea, value) => {
            textarea.value = value.join('')
        }, articleTitle)

        await delay(3)

        logToTextArea('[INFO] Enter the Google Image Page')
        const googleImage = 'https://www.google.com/imghp?hl=en&ogbl'
        const page3 = await browser.newPage();
        await page3.goto(googleImage, {
            waitUntil: ['domcontentloaded', 'networkidle2'],
            timeout: 120000,
        })

        await page3.waitForSelector('[name="q"]')
        await page3.type('[name="q"]', keyword)

        await page3.keyboard.press('Enter')

        await delay(3)

        async function getRandomImageURL() {
            let imageURL = null;

            while (imageURL == null) {
                logToTextArea('[INFO] Search for Random Images in Google Image');
                await page3.waitForSelector('.rg_i');
                const imageSelector = await page3.$$('.rg_i');
                const randomImageIndex = Math.floor(Math.random() * imageSelector.length);
                const randomImage = imageSelector[randomImageIndex];

                await randomImage.click();

                logToTextArea('[INFO] Copy Random Image URL');
                await delay(10);

                imageURL = await page3.evaluate(() => {
                    const imageElement = document.querySelector("#Sva75c > div.A8mJGd.NDuZHe.CMiV2d.OGftbe-N7Eqid-H9tDt > div.dFMRD > div.AQyBn > div.tvh9oe.BIB1wf.hVa2Fd > c-wiz > div > div > div > div > div.v6bUne > div.p7sI2.PUxBg > a > img.sFlh5c.pT0Scc.iPVvYb");
                    return imageElement ? imageElement.src : null;
                });
            }

            return imageURL;
        }

        const imageURL = await getRandomImageURL();

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

        // write chtgpt
        await sendChat(keyword, 2)

        const articleTextBody = await extractText(false)
        articleTextBody.unshift('<div class="markdown prose w-full break-words dark:prose-invert light" style="text-align: justify;">');
        articleTextBody.unshift('<br>')
        articleTextBody.push("</div>");

        await page.bringToFront()
        await page2.bringToFront()

        await delay(2)

        await page2.click('#content')
        articleTextBody.unshift(tagIMG)

        // console.log(articleTextBody)

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

        // Menghapus Post Excerpt
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

        // write chtgpt
        await sendChat(keyword, 3)

        const metaTag = await extractText(true)

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

        logToTextArea('[INFO] Close Google Image Page and Wordpress Page\n')
        await page3.close()
        await page2.close()
    }

    const sendChat = async (keyword, key) => {
        try {
            const writeGPT = await page.$('#prompt-textarea');

            if (key === 1) {
                await writeGPT.type('create one title maximal 60 characters about ' + keyword + ' and remove the quotation mark at the beginning and end of the title');
            } else if (key === 2) {
                await writeGPT.type('create an article with minimum 600 words from title above without displaying the article title. Article using tag paragraph and add a sub heading for each paragraph. Add ' + keyword + ' as a link in the middle of article sentence of the article result with this url ' + data.dom);
            } else if (key === 3) {
                await writeGPT.type('Create meta tag 160 characters but not html code version and add the title above in the first and remove the quotation mark at the beginning and the end');
            } else if (key === 4) {
                await writeGPT.type(`Create 10 consecutive tags using commas from the ${keyword} keyword`)
            }

            await delay(2)

            await page.click('button[data-testid="send-button"]')

            try {
                await page.waitForSelector('button[data-testid="send-button"]', {
                    timeout: 120000
                })
            } catch (error) {
                await checkLimit(await extractText(true))
            }

            await delay(3)
        } catch (error) {
            throw error;
        }
    }

    const extractText = async (notOuter) => {
        let article = [];

        const data = await page.$$('#__next > div.relative.z-0.flex.h-full.w-full.overflow-hidden > div > main > div.flex.h-full.flex-col > div.flex-1.overflow-hidden > div > div > div > div > div > div > div.relative.flex.w-full.flex-col.lg\\:w-\\[calc\\(100\\%-115px\\)\\].agent-turn > div.flex-col.gap-1.md\\:gap-3 > div.flex.flex-grow.flex-col.max-w-full > div > div');

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

    const checkLimit = async (dataArticle) => {
        if (dataArticle.includes("You've reached our limit of messages per hour. Please try again later.") || dataArticle.includes('Something went wrong. If this issue persists please contact us through our help center at help.openai.com.') || dataArticle.includes('An error occurred. Either the engine you requested does not exist or there was another issue processing your request. If this issue persists please contact us through our help center at help.openai.com.') || dataArticle.includes('Conversation not found')) {
            stops = true
            logToTextArea("Limit Reached Close And Stop proccess")
            await browser.close()
            return;
        }
    }

    const workFlow = async () => {
        try {
            const files = fs.readFileSync(data.files, 'utf-8').split('\n')

            for (let i = 0; i < files.length; i++) {
                if (stops) {
                    logToTextArea("Stop Proccess is done")
                    break;
                }
                let keyword = files[i].trim();
                logToTextArea(`Article Process ${i + 1}`)
                await coreProccess(keyword)
                const countProggress = parseInt(((i + 1) / files.length) * 100)
                proggress(countProggress)

                if (stops) {
                    logToTextArea("Stop Proccess is done")
                    break;
                }
            }

            await browser.close()
        } catch (error) {
            logToTextArea(error)
            await browser.close()
        }
    }

    await loadCookies()
    await workFlow()
}

const stopProccess = async () => {
    stops = true
}

module.exports = {
    mainProccess,
    stopProccess
}