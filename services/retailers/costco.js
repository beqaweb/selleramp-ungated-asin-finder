const { analyzeProductMatch, searchRetailStoreClientSide } = require("./base");

const searchCostco = async (productTitle) => {
  const storeUrl = "https://www.costco.ca";

  const doExtraSteps = async (page) => {
    const searchInputSelector = 'input[placeholder*="Search"]';
    await page.waitForSelector(searchInputSelector, { timeout: 10000 });
    await page.click(searchInputSelector, { clickCount: 3 });
    await page.type(searchInputSelector, productTitle);
    await Promise.all([
      page.keyboard.press("Enter"),
      page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 }),
    ]);
  };

  const result = await searchRetailStoreClientSide(storeUrl, {
    waitForSelector: "#productList",
    doExtraSteps,
  });

  if (!result.success) {
    return {
      store: "Costco",
      available: false,
      error: result.error,
    };
  }

  const $ = result.$;

  const searchResults = $("#productList > div");

  if (searchResults.length === 0) {
    return {
      store: "Costco",
      available: false,
      productCount: 0,
      products: [],
    };
  }

  const products = [];
  const matchedProducts = [];

  searchResults.slice(0, 8).each((_index, element) => {
    const productName = $(element).find("h3").first().text().trim();

    const productPriceRaw = $(element)
      .find("[data-testid*=Text_Price]")
      .first()
      .text()
      .trim();
    const price = productPriceRaw.match(
      /\$(\d{1,3}(,\d{3})*(\.\d+)?|\d+(\.\d+)?)/,
    );
    const productPrice = price ? Number(price[1].replace(/,/g, "")) : null;

    if (productName || productPrice) {
      const matchAnalysis = analyzeProductMatch(productTitle, productName);

      products.push({
        name: productName,
        price: productPrice,
        matchConfidence: matchAnalysis.confidence,
      });

      if (matchAnalysis.available) {
        matchedProducts.push({
          name: productName,
          price: productPrice,
          matchConfidence: matchAnalysis.confidence,
          matchDetails: matchAnalysis.details,
        });
      }
    }
  });

  const isAvailable = matchedProducts.length > 0;

  return {
    store: "Costco",
    available: isAvailable,
    productCount: products.length,
    matchedCount: matchedProducts.length,
    products:
      matchedProducts.length > 0
        ? matchedProducts.slice(0, 3)
        : products.slice(0, 3),
  };
};

module.exports = {
  searchCostco,
};
