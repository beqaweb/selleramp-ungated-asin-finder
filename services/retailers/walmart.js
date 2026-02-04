const {
  searchRetailStore,
  normalizeQuery,
  analyzeProductMatch,
} = require("./base");

const searchWalmart = async (productTitle) => {
  const query = normalizeQuery(productTitle);
  const storeUrl = `https://www.walmart.ca/en/search?q=${query}`;

  const result = await searchRetailStore(storeUrl);

  if (!result.success) {
    return {
      store: "Walmart",
      available: false,
      error: result.error,
    };
  }

  const $ = result.$;

  const searchResults = $('[data-testid="item-stack"] [data-item-id]');

  if (searchResults.length === 0) {
    return {
      store: "Walmart",
      available: false,
      productCount: 0,
      products: [],
    };
  }

  const products = [];
  const matchedProducts = [];

  searchResults.slice(0, 10).each((_index, element) => {
    const productName = $(element).find("a").first().text().trim();

    const productPriceRaw = $(element)
      .find('[data-automation-id="product-price"]')
      .first()
      .text()
      .trim();
    const discountedPriceMatch = productPriceRaw.match(/Now\s\$(\d+(\.\d+)?)/);
    const price = productPriceRaw.match(/\$(\d+(\.\d+)?)/);
    const productPrice = discountedPriceMatch
      ? Number(discountedPriceMatch[1])
      : price
        ? Number(price[1])
        : null;

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
    store: "Walmart",
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
  searchWalmart,
};
