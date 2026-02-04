const cheerio = require("cheerio");

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

// Fetch and parse Amazon.ca product page
const fetchAmazonProduct = async (asin) => {
  const url = `https://www.amazon.ca/dp/${asin}`;
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });
    const html = await response.text();
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
  }
};

module.exports = {
  isUngatedASIN,
  fetchAmazonProduct,
};
