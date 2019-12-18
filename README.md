# litiscrape-puppet

The following, contained in `site-tree.js` and `site-preprocess.js`, is the nodejs source code for my efforts in using Google's Puppeteer as all-case website link crawler (ie can handle JS-based link traversal such as window.open() and location.href() and all the many other ways JS can be used to open new pages on a website)...

After many hours of work in development and scanning the web for code that could help me do this, I came to the conclusion that Puppeteer just wasn't built for doing something like this.

Puppeteer was built as a way to 100% test web applications WHERE THE LINKS AND INPUTS are known, NOT as a tool that goes out a "discovers" and "maps" totally unknown websites, so some of the functionality I need just isn't available in the base code of the project.  

I did manage to get my system to actually "click" links and load the pages, so building out a very powerful crawler probabaly is possible, but would require MANY hours of development and testing time...

In order to test my system, you have to first install nodejs and npm, then install Puppeteer and the other modules indicated in my require() statements, then pull the code into your directory.

Since this is a private repos, there is no need to put the full install instructions here...just hit me up if you have any questions.

The actual WORKING code that I was developing is contained in `site-preprocess.js`, so install all the `require()` modules to run.

- markus enriquez  12/17/19
