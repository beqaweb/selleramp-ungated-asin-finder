const {
  searchRetailStoreClientSide,
  normalizeQuery,
  analyzeProductMatch,
} = require("./base");

const searchHomeDepot = async (productTitle) => {
  const query = normalizeQuery(productTitle, " ");
  const storeUrl = `https://www.homedepot.ca/search?q=${query}`;

  const result = await searchRetailStoreClientSide(storeUrl, {
    waitForSelector: "acl-product-card-group",
  });

  if (!result.success) {
    return {
      store: "Home Depot",
      available: false,
      error: result.error,
    };
  }

  const $ = result.$;

  const searchResults = $("acl-product-card-group article");

  if (searchResults.length === 0) {
    return {
      store: "Home Depot",
      available: false,
      productCount: 0,
      products: [],
    };
  }

  const products = [];
  const matchedProducts = [];

  searchResults.slice(0, 10).each((_index, element) => {
    const productName = $(element).find("h2").first().text().trim();

    const productPriceDollarsRaw = $(element)
      .find(".acl-product-card__price-dollars")
      .first()
      .text()
      .trim();
    const productPriceDollars = productPriceDollarsRaw.match(/\$(\d+)/);
    const productPriceCentsRaw = $(element)
      .find(".acl-product-card__price-cents")
      .first()
      .text()
      .trim();
    const productPriceCents = productPriceCentsRaw.match(/(\d{2})/);
    const price =
      productPriceDollars && productPriceCents
        ? `${productPriceDollars[1]}.${productPriceCents[1]}`
        : null;
    const productPrice = price ? Number(price) : null;

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
    store: "Home Depot",
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
  searchHomeDepot,
};
