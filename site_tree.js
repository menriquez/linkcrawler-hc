/**
 *
 *   my first attempt at building a click-based URL crawler...included because some of the routines could be valuable
 *
 *   - markus enriquez  12-17-19
 *
 */
const fs = require('fs');
const del = require('del');
const util = require('util');
const puppeteer = require('puppeteer');
const sharp = require('sharp');
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
    .option('basedir', {
        alias: 'b',
        type: 'string',
        description: 'Base directory for screenshots'

    })
    .argv;

const URL = args.url
const SCREENSHOTS = args.screenshots;
const DEPTH = args.depth || 3;
const VIEWPORT = SCREENSHOTS ? {width: 1600, height: 3000, deviceScaleFactor: 2} : null;
const OUT_DIR = args.basedir || `/${slugify(URL)}`;

const crawledPages = new Map();
const maxDepth = DEPTH;

function slugify(str) {
    return str.replace(/[\/:]/g, '_');
}

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

/**
 * Finds all anchors on the page, inclusive of those within shadow roots.
 * Note: Intended to be run in the context of the page.
 * @param {boolean=} sameOrigin When true, only considers links from the same origin as the app.
 * @return {!Array<string>} List of anchor hrefs.
 */
function collectAllSameOriginAnchorsDeep(sameOrigin = true) {
    const allElements = [];

    const findAllElements = function(nodes) {
        for (let i = 0, el; el = nodes[i]; ++i) {
            allElements.push(el);
            // If the element has a shadow root, dig deeper.
            if (el.shadowRoot) {
                findAllElements(el.shadowRoot.querySelectorAll('*'));
            }
        }
    };

    findAllElements(document.querySelectorAll('*'));

    const filtered = allElements
        .filter(el => el.localName === 'a' && el.href) // element is an anchor with an href.
        .filter(el => el.href !== location.href) // link doesn't point to page's own URL.
        .filter(el => {
            if (sameOrigin) {
                return new URL(location).origin === new URL(el.href).origin;
            }
            return true;
        })
        .map(a => a.href);

    return Array.from(new Set(filtered));
}

/**
 *
 * the recursive routine that attempts to crawl a  website not by parsing <a> links but by actually
 * CLICKING on the link on the page, and by storing the URI of the redirected page actually loaded by the
 * web browser.
 *
 * the overriding point of this is to build a website link crawler that can find every URL of a website no matter
 * if the site uses JS-based navigation or HTML-based...
 *
 */
async function crawl(browser, page, depth = 0) {

    if (depth > maxDepth) {
        return;
    }

    // If we've already crawled the URL, we know its children.
    if (crawledPages.has(page.url)) {
        console.log(`Reusing route: ${page.url}`);
        const item = crawledPages.get(page.url);
        page.title = item.title;
        page.img = item.img;
        page.children = item.children;
        // Fill in the children with details (if they already exist).
        page.children.forEach(c => {
            const item = crawledPages.get(c.url);
            c.title = item ? item.title : '';
            c.img = item ? item.img : null;
        });
        return;
    } else {
        console.log(`Loading: ${page.url}`);

        const newPage = await browser.newPage();
        await newPage.goto(page.url, {waitUntil: 'networkidle2'});

        let anchors = await newPage.evaluate(collectAllSameOriginAnchorsDeep);
        anchors = anchors.filter(a => a !== URL) // link doesn't point to start url of crawl.

        page.title = await newPage.evaluate('document.title');
        page.children = anchors.map(url => ({url}));

        if (SCREENSHOTS) {
            const path = `./${OUT_DIR}/${slugify(page.url)}.png`;
            let imgBuff = await newPage.screenshot({fullPage: true});
            imgBuff = await sharp(imgBuff).resize(null, 150).toBuffer(); // resize image to 150 x auto.
            util.promisify(fs.writeFile)(path, imgBuff); // async
            page.img = `data:img/png;base64,${imgBuff.toString('base64')}`;
        }

        crawledPages.set(page.url, page); // cache it.

        await newPage.close();
    }

    // Crawl subpages.
    for (const childPage of page.children) {
        await crawl(browser, childPage, depth + 1);
    }
}

(async() => {

    mkdirSync(OUT_DIR); // create output dir if it doesn't exist.
    await del([`${OUT_DIR}/*`]); // cleanup after last run.

    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    if (VIEWPORT) {
        await page.setViewport(VIEWPORT);
    }

    const root = {url: URL};
    await crawl(browser, root);

    await util.promisify(fs.writeFile)(`./${OUT_DIR}/crawl.json`, JSON.stringify(root, null, ' '));

    await browser.close();

})();
