const {
  searchRetailStoreClientSide,
  normalizeQuery,
  analyzeProductMatch,
} = require("./base");

const searchCanadianTire = async (productTitle) => {
  const query = normalizeQuery(productTitle);
  const storeUrl = `https://www.canadiantire.ca/en/search-results.html?q=${query}`;

  // Use client-side rendering function since Canadian Tire loads products dynamically
  const result = await searchRetailStoreClientSide(
    storeUrl,
    '[data-testid="product-grids"]',
  );

  if (!result.success) {
    return {
      store: "Canadian Tire",
      available: false,
      error: result.error,
    };
  }

  const $ = result.$;

  const searchResults = $(
    '#product-listing-panel ul li[data-testid="product-grids"]',
  );

  if (searchResults.length === 0) {
    return {
      store: "Canadian Tire",
      available: false,
      productCount: 0,
      products: [],
    };
  }

  const products = [];
  const matchedProducts = [];

  searchResults.slice(0, 10).each((_index, element) => {
    const productName = $(element)
      .find(".nl-product-title-sku")
      .first()
      .text()
      .trim();

    const productPriceRaw = $(element)
      .find('[data-testid="priceTotal"]')
      .first()
      .text()
      .trim();
    const price = productPriceRaw.match(/\$(\d+(\.\d+)?)/);
    const productPrice = price ? Number(price[1]) : null;

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
    store: "Canadian Tire",
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
  searchCanadianTire,
};
