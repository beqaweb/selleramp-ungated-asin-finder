const { exec } = require("child_process");
const cheerio = require("cheerio");
const puppeteer = require("puppeteer");
const { setTimeout } = require("node:timers/promises");

const CANADIAN_RETAILERS = [
  "costco.ca",
  "costcobusinesscentre.ca",
  "walmart.ca",
  "realcanadiansuperstore.ca",
  "loblaws.ca",
  "nofrills.ca",
  "metro.ca",
  "foodbasics.ca",
  "sobeys.com",
  "farmboy.ca",
  "canadiantire.ca",
  "sportchek.ca",
  "marks.com",
  "atmosphere.ca",
  "staples.ca",
  "bestbuy.ca",
  "thesource.ca",
  "homedepot.ca",
  "rona.ca",
  "lowes.ca",
  "homehardware.ca",
  "uline.ca",
  "grandandtoy.com",
  "dhdistributing.com",
  "r3distributing.com",
  "midoco.ca",
  "sesco.ca",
  "canadawide.ca",
  "polariswholesale.ca",
  "ssactivewear.com",
  "alphabroder.ca",
  "sanmarcanada.com",
  "primeline.ca",
  "sigmaelectric.com",
  "cdplus.ca",
  "spicers.ca",
  "tenaquip.com",
  "fastenersplus.ca",
  "grainger.ca",
  "henryschein.ca",
  "mckesson.ca",
  "vwr.com",
  "vwr.ca",
  "bunzlcanada.ca",
  "gfs.ca",
  "sysco.ca",
  "wholesaleclub.ca",
  "pattisonfoodgroup.com",
  "saputo.com",
  "mapleleaffoods.com",
  "lassonde.com",
  "agropur.com",
  "oceanchoice.com",
  "highlinerfoods.com",
  "kraftheinzcompany.com",
  "nestle.ca",
  "unilever.ca",
  "pg.ca",
  "colgatepalmolive.ca",
  "jnjcanada.com",
  "clorox.ca",
  "scjohnson.com",
  "reckitt.com",
  "churchdwight.com",
  "kimberly-clark.com",
  "duracell.com",
  "energizer.ca",
  "fiskars.com",
  "rubbermaid.com",
  "contigo.com",
  "oxo.com",
  "blackanddecker.ca",
  "dewalt.ca",
  "boschtools.com",
  "milwaukeetool.ca",
  "hamiltonbeach.ca",
  "ninjakitchen.ca",
  "instantpot.com",
  "cuisinart.ca",
  "corelle.com",
  "pyrexhome.com",
  "anchorhocking.com",
  "thermos.com",
  "ziploc.com",
  "scotchbrand.com",
  "avery.ca",
  "pilotpen.ca",
  "bicworld.com",
  "crayola.ca",
  "elmers.com",
  "hasbro.ca",
  "mattel.com",
  "spinmaster.com",
  "mastermindtoys.com",
  "chapters.indigo.ca",
  "mec.ca",
  "decathlon.ca",
  "lululemon.com",
  "roots.com",
  "aritzia.com",
  "hbc.com",
  "londondrugs.com",
  "shoppersdrugmart.ca",
  "rexall.ca",
  "well.ca",
  "naturesfare.com",
  "naturalfactors.com",
  "webbernaturals.com",
  "jamiesonvitamins.com",
  "canprev.ca",
  "ironvegan.ca",
  "vega.com",
  "atlaswholesale.ca",
  "canadapackaging.com",
  "mitrex.com",
  "cascades.com",
  "kruger.com",
  "irvingconsumerproducts.com",
  "sunlabelgroup.com",
  "staplesprint.ca",
  "canadapost.ca",
  "supremesecurity.com",
];

// Find Chrome installation path
const findChromePath = () => {
  const paths = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ];
  return paths[0]; // Default to first path, adjust if needed
};

const chromePath = findChromePath();
const debuggingPort = 9223;
const userDataDir = require("path").join(
  require("os").tmpdir(),
  "puppeteer-profile",
);

async function connectToChrome() {
  // Spawn Chrome process with debugging port
  const headless = true;
  const cmd = `"${chromePath}" --remote-debugging-port=${debuggingPort} --user-data-dir="${userDataDir}" --no-first-run --no-default-browser-check ${headless ? "--headless=new" : ""} about:blank`;
  exec(cmd);

  // Wait for Chrome to start and connect
  let browser;
  for (let i = 0; i < 100; i++) {
    try {
      browser = await puppeteer.connect({
        browserURL: `http://localhost:${debuggingPort}`,
      });
      break;
    } catch (e) {
      await setTimeout(100);
    }
  }

  if (!browser) {
    throw new Error(
      "Failed to connect to Chrome. Make sure Chrome is installed.",
    );
  }

  return browser;
}

async function checkCanadianAvailability(asin, browserInstance = null) {
  let browser = browserInstance;
  const shouldCloseBrowser = !browserInstance; // Only close if we opened it

  try {
    if (!asin) {
      return {
        available: false,
        confidence: 0,
        message: "No ASIN provided",
        retailersFound: [],
        productTitle: null,
      };
    }

    // Connect to real Chrome instance only if one wasn't provided
    if (!browser) {
      browser = await connectToChrome();
    }

    // First tab: Open Amazon ASIN page and grab title
    const amazonPage = await browser.newPage();
    await amazonPage.setViewport({ width: 1920, height: 1080 });

    const amazonUrl = `https://www.amazon.ca/dp/${asin}`;
    await amazonPage.goto(amazonUrl, {
      waitUntil: "load",
      timeout: 30000,
    });

    const amazonHtml = await amazonPage.content();
    const amazonCheerio = cheerio.load(amazonHtml);
    const productTitle = amazonCheerio("#productTitle").first().text().trim();

    if (!productTitle) {
      await amazonPage.close();
      if (shouldCloseBrowser && browser) await browser.close();
      return {
        available: false,
        confidence: 0,
        message: "Could not fetch product title from Amazon",
        retailersFound: [],
        productTitle: null,
      };
    }

    await amazonPage.close();

    // Second tab: Open Google Search for the product
    const googlePage = await browser.newPage();
    await googlePage.setViewport({ width: 1920, height: 1080 });

    // Search Google for product with .ca domain filter
    const query = encodeURIComponent(productTitle);
    const searchUrl = `https://www.google.com/search?q=${query}`;

    await googlePage.goto(searchUrl, {
      waitUntil: "load",
      timeout: 30000,
    });

    const html = await googlePage.content();
    const $ = cheerio.load(html);

    // Extract URLs from search results
    const resultUrls = $("div[jscontroller] a[href^=https]")
      .map((_index, element) => {
        return $(element).attr("href").trim();
      })
      .get()
      .filter((url) => {
        try {
          const domain = new URL(url).hostname;
          const pathname = new URL(url).pathname;
          const search = new URL(url).search;

          // Exclude Google and Amazon
          if (
            domain.includes("google.ca") ||
            domain.includes("google.com") ||
            domain.includes("ebay.com") ||
            domain.includes("ebay.ca") ||
            domain.includes("amazon.com") ||
            domain.includes("amazon.ca")
          ) {
            return false;
          }

          // Exclude search/category/results pages
          const searchPatterns = [
            /\/search/i,
            /\/results/i,
            /\/browse/i,
            /\/products\?/i,
            /\/category/i,
            /\?q=/,
            /\?search=/,
            /\?query=/,
            /\/s\?/,
          ];

          const isSearchPage = searchPatterns.some(
            (pattern) => pattern.test(pathname) || pattern.test(search),
          );

          return !isSearchPage;
        } catch (e) {
          return false;
        }
      });

    // Check if any results are from Canadian retailers
    const retailerUrlsMap = new Map();

    resultUrls.forEach((url) => {
      const domain = new URL(url).hostname;
      const retailerFound = CANADIAN_RETAILERS.find((retailer) =>
        url.includes(retailer),
      );
      if (retailerFound) {
        const existing = retailerUrlsMap.get(retailerFound);
        retailerUrlsMap.set(
          retailerFound,
          existing ? existing.add(url) : new Set([url]),
        );
      } else if (domain.endsWith(".ca")) {
        const existing = retailerUrlsMap.get(domain);
        retailerUrlsMap.set(
          domain,
          existing ? existing.add(url) : new Set([url]),
        );
      }
    });

    const retailersFound = Array.from(retailerUrlsMap.keys());

    const maxRetailers = CANADIAN_RETAILERS.length;
    const confidence = (retailersFound.length / maxRetailers) * 100;

    await googlePage.close();

    // Only close browser if we opened it
    if (shouldCloseBrowser && browser) {
      await browser.close();
    }

    return {
      available: retailersFound.length > 1,
      confidence: Math.round(confidence),
      message:
        retailersFound.length > 0
          ? `Found on ${retailersFound.length} Canadian retailer(s)`
          : "Not found on major Canadian retailers",
      retailersFound: Object.fromEntries(
        Array.from(retailerUrlsMap.entries()).map(([retailer, urls]) => [
          retailer,
          Array.from(urls),
        ]),
      ),
      totalResults: resultUrls.length,
      productTitle: productTitle,
      productPrice: null, // Could extract price from Amazon page if needed
    };
  } catch (error) {
    console.error("Google availability check error:", error.message);
    if (shouldCloseBrowser && browser) {
      await browser.close();
    }
    return {
      available: false,
      confidence: 0,
      message: `Error: ${error.message}`,
      retailersFound: [],
      productTitle: null,
    };
  }
}

module.exports = { checkCanadianAvailability, connectToChrome };
