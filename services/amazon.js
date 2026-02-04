const cheerio = require("cheerio");
const puppeteer = require("puppeteer");
const { setTimeout } = require("node:timers/promises");

// Check if ASIN is ungated on Amazon Seller Central
const isUngatedASIN = async (asin, condition = "new") => {
  const amazonCookies = process.env.AMAZON_COOKIES;

  if (!amazonCookies) {
    throw new Error("AMAZON_COOKIES environment variable is not set");
  }

  const url = `https://sellercentral.amazon.ca/productsearch/v2/search?q=${asin}&page=1&`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "User-Agent": "Mozilla/5.0",
      Accept: "application/json",
      Cookie: amazonCookies,
    },
  });
  const data = await response.json();
  const products = data.products;
  if (products.length === 0) return false;
  const product = products.find((product) => product.asin === asin.trim());
  if (!product) return false;
  const qualificationMessages = product.qualificationMessages || [];
  const isRestricted = qualificationMessages.some((item) =>
    item.qualificationMessage.toLowerCase().includes("need approval"),
  );
  if (!product.pathToSellUrl && !isRestricted) {
    return true;
  }
  return false;
};

// Fetch and parse Amazon.ca product page using Puppeteer
const fetchAmazonProduct = async (asin) => {
  const url = `https://www.amazon.ca/dp/${asin}`;
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--no-first-run",
        "--no-default-browser-check",
      ],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    await page.goto(url, { waitUntil: "networkidle0", timeout: 30000 });

    const html = await page.content();
    const $ = cheerio.load(html);

    const title = $("#productTitle").first().text().trim();
    const productPriceRaw = $("#corePrice_feature_div .a-offscreen")
      .first()
      .text()
      .trim();
    const price = productPriceRaw.match(/\$(\d+(\.\d+)?)/);

    return {
      asin,
      title,
      price: price ? Number(price[1]) : null,
      success: true,
    };
  } catch (error) {
    return {
      asin,
      success: false,
      error: error.message,
    };
  } finally {
    if (browser) await browser.close();
  }
};

module.exports = {
  isUngatedASIN,
  fetchAmazonProduct,
};
