'use strict';

const args = require('yargs').usage('Usage: $0 -u [url to crawl] ')
    .demandOption(['u'])
    .option('verbose', {
        alias: 'v',
        type: 'boolean',
        description: 'Run with verbose logging'
    })
    .option('url', {
        alias: 'u',
        type: 'string',
        description: 'URL to crawl'
    })
    .option('screenshots', {
        alias: 's',
        type: 'boolean',
        description: 'Take screenshots as it finds new pages'
    })
    .option('depth', {
        alias: 'd',
        type: 'int',
        description: 'How meny levels deep to crawl.'
    })
    .option('debug', {
        alias: 'x',
        type: 'boolean',
        description: 'Write debug info to'
    })
    .option('basedir', {
        alias: 'b',
        type: 'string',
        description: 'Base directory for screenshots'

    })
    .argv;

const puppeteer = require('puppeteer');
const devices = require('puppeteer/DeviceDescriptors');
const fs = require('fs-extra');
const request = require('request');

function mkdirSync(dirPath) {
    try {
        dirPath.split('/').reduce((parentPath, dirName) => {
            const currentPath = parentPath +  dirName;
            if (!fs.existsSync(currentPath)) {
                fs.mkdirSync(currentPath);
            }
            return currentPath + '/';
        }, '');
    } catch (err) {
        if (err.code !== 'EEXIST') {
            throw err;
        }
    }
}
async function crawl(page) {

    const url = await page.url();

    // kick out already processed pages
    if (crawled_pages.has(url)) {
        CURRENT_DEPTH--;
        return false;
    }

    // scrape all rendered <a> links off page...and i mean all!
    let page_alinks = await page.$$("a");

    console.log("[ " + url + " ] links found: " + page_alinks.length);
    // kick out of recursion if we dont find any links on the page...
    if (page_alinks.length === 0) return false;

    let uncrawled_alinks = page_alinks.filter(x => !crawled_alinks.includes(x));
    if (uncrawled_alinks.length === 0) return false;

    console.log("[ " + url + " ] uncrawled links found: " + uncrawled_alinks.length);

    // var data = await page.$eval('a[href|="data:text"]', el => el.href);
    crawled_alinks.push(page_alinks[0]);

    // now add each of the links to a mapped collection using the concatted text and link values as the key and the link node as the value
    for (let click_node of uncrawled_alinks) {

        let href_value = await (await click_node.getProperty('href')).jsonValue();
        let text_value = await (await click_node.getProperty('text')).jsonValue();

        let redir_value = "";
        request({url: href_value, followRedirect: false}, function (err, res, body) {
            if (err) {
                redir_value =  click_node.click.toString();
            }
            else redir_value = res.headers.location;
        });

        if (debug) {
            console.log("text = " + text_value);
            console.log("href = " + href_value);
            console.log("redir= " + redir_value);
        }

        // track how deep into the recurse are we
        click_node.depth = CURRENT_DEPTH + 1;
        click_node.redir = redir_value;

        if (qued_clickable_links.store_link(text_value, href_value, click_node)) {
            if (debug) console.log("storg link [ " + text_value + "`" + href_value + " ]");
        } else {
            if (debug) console.log("rejecting link [ " + text_value + "`" + href_value + " ]");
        }


        (async () => {
            const newPagePromise = getNewPageWhenLoaded();
            await click_node.click({delay: 100});
            const page = await newPagePromise;
            page.depth = CURRENT_DEPTH + 1;
            CURRENT_DEPTH++;
            let rv = await crawl(page);
        })();

        page.on('response', response => {
            const status = response.status();
            if ((status >= 300) && (status <= 399)) {
                console.log('Redirect from', response.url(), 'to', response.headers()['location']);
                next_page.redirect_url = response.headers()['location']

            }
        })
    }

    CURRENT_DEPTH--;
    return true;
};

// best way i could come up with to make sure that a new page object generated from a <a>-node "click" exists and has
// been loaded...returns a Promise and requires a browser object to be passed in so it knows where to look for events
const getNewPageWhenLoaded =  async () => {
    return new Promise(x =>
        browser.on('targetcreated', async target => {
            if (target.type() === 'page') {
                const newPage = await target.page();
                const newPagePromise = new Promise(y =>
                    newPage.once('domcontentloaded', () => y(newPage))
                );
                const isPageLoaded = await newPage.evaluate(
                    () => document.readyState
                );
                return isPageLoaded.match('complete|interactive')
                    ? x(newPage)
                    : x(newPagePromise);
            }
        })
    );
};

// global array to hold all the page urls that we find for later screenshots and scraping
const crawled_pages         = new Map();
const crawled_alinks        = [];
const qued_clickable_links  = new Map();            // collection of

const IS_SCREENSHOT = args.screenshots;     // do we screenshot each newly found page?
const BASEDIR       = args.basedir;         // where to put the scrape and screenshots
const MAX_DEPTH     = args.depth || 2;      // how deep to recurese set by the user
let CURRENT_DEPTH = 0;                    // how deep is the current recursion?
const debug         = args.debug || false;  // how deep is the current recursion?
let browser         = null;                 // having a global browser object saves resources

(async () => {

    mkdirSync(BASEDIR);

    browser = await puppeteer.launch({headless: true});

    let url = args.url;

    const page = await browser.newPage();
    console.log(`Fetching page data for : ${url}...`);


    await page.goto(url, {waitUntil: 'networkidle2'});
    await page.waitFor(2000);

    let rv =  await crawl(page);

    await write_array(BASEDIR+"/crawled-links.txt");


})();

// With async/await:
async function write_array (f) {
    try {
        await fs.outputFile(f, crawled_alinks);
        console.log(data) // => hello!
    } catch (err) {
        console.error(err)
    }
}

Map.prototype.store_link = function(k1,k2,node) {
    let key = k1+"`"+k2;
    if (this.has(key)) return false;
    this.set(key,node);
    return true;
};


