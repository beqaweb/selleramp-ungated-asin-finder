const cheerio = require("cheerio");
const puppeteer = require("puppeteer");

// Generic function to search retail stores (static HTML)
const searchRetailStore = async (storeUrl) => {
  try {
    const response = await fetch(storeUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });
    const html = await response.text();
    const $ = cheerio.load(html);

    // Generic pattern: returns the HTML content for the caller to analyze
    // This allows flexibility for adapting selectors per store
    return {
      success: true,
      html,
      $,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
};

// Function for client-side rendered stores (uses headless browser)
const searchRetailStoreClientSide = async (
  storeUrl,
  waitForSelector = null,
  needsReload = false,
  timeout = 150000,
  geolocation = { latitude: 43.6683343, longitude: -79.3354333 }, // Toronto, ON by default
) => {
  let browser;
  let context;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    context = browser.defaultBrowserContext();
    const origin = new URL(storeUrl).origin;
    await context.overridePermissions(origin, ["geolocation"]);

    const page = await context.newPage();

    await page.setViewport({ width: 1920, height: 1080 });

    if (geolocation) {
      await page.setGeolocation(geolocation);
    }

    await page.setExtraHTTPHeaders({
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    });

    await page.goto(storeUrl, { waitUntil: "networkidle2", timeout });
    // reload just in case of any dynamic content and edge cases
    if (needsReload) {
      await page.reload({ waitUntil: "networkidle2", timeout });
    }

    if (waitForSelector) {
      try {
        await page.waitForSelector(waitForSelector, { timeout });
      } catch (e) {
        console.warn(`Selector "${waitForSelector}" not found on ${storeUrl}`);
      }
    }

    const html = await page.content();
    const $ = cheerio.load(html);

    await browser.close();

    return {
      success: true,
      html,
      $,
    };
  } catch (error) {
    if (browser) {
      await browser.close();
    }
    return {
      success: false,
      error: error.message,
    };
  }
};

// Join query words with + for URL encoding
const normalizeQuery = (query) => {
  return query
    .trim()
    .split(/\s+/)
    .map((word) => encodeURIComponent(word))
    .join("+");
};

// Calculate string similarity using Levenshtein distance
const stringSimilarity = (str1, str2) => {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;

  if (longer.length === 0) return 1.0;

  const editDistance = getEditDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
};

// Calculate edit distance (Levenshtein distance)
const getEditDistance = (s1, s2) => {
  const costs = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  return costs[s2.length];
};

// Extract key product identifiers (brand, main keywords)
const extractKeywords = (productTitle) => {
  // Remove common words and variations
  const stopWords =
    /\b(the|a|an|and|or|in|on|at|to|for|of|with|by|from|as|is|are|was|were|been|be|have|has|had|do|does|did|will|would|could|should|may|might|must|can)\b/gi;
  const keywords = productTitle
    .replace(stopWords, "")
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 2); // Only keep words longer than 2 chars

  return new Set(keywords);
};

// Analyze if found product matches the original product
const analyzeProductMatch = (originalTitle, foundProductName) => {
  if (!foundProductName || foundProductName.length === 0) {
    return { confidence: 0, available: false };
  }

  // 1. Direct string similarity
  const directSimilarity = stringSimilarity(originalTitle, foundProductName);

  // 2. Keyword matching
  const originalKeywords = extractKeywords(originalTitle);
  const foundKeywords = extractKeywords(foundProductName);

  let matchedKeywords = 0;
  let keywordSimilarity = 0;

  if (originalKeywords.size > 0) {
    originalKeywords.forEach((keyword) => {
      if (foundKeywords.has(keyword)) {
        matchedKeywords++;
      }
    });
    keywordSimilarity = matchedKeywords / originalKeywords.size;
  }

  // 3. Check for product variations (size, color, variant indicators)
  const variantIndicators =
    /\b(size|color|colour|variant|model|version|xl|l|m|s|xs|gb|inch|cm|mm|g|kg|ml|oz)\b/gi;
  const originalVariants = (originalTitle.match(variantIndicators) || [])
    .length;
  const foundVariants = (foundProductName.match(variantIndicators) || [])
    .length;

  // Allow slight mismatch in variants (e.g., found product might list different variant)
  const variantMatch =
    originalVariants > 0
      ? Math.min(1, (foundVariants / originalVariants) * 0.5 + 0.5)
      : 0.8;

  // Calculate weighted confidence score
  const weights = {
    directSimilarity: 0.4,
    keywordSimilarity: 0.45,
    variantMatch: 0.15,
  };

  const confidence =
    directSimilarity * weights.directSimilarity +
    keywordSimilarity * weights.keywordSimilarity +
    variantMatch * weights.variantMatch;

  return {
    confidence: Math.round(confidence * 100) / 100, // Round to 2 decimals
    available: confidence >= 0.4, // True if confidence >= 40%
    details: {
      directSimilarity: Math.round(directSimilarity * 100),
      keywordMatches: `${matchedKeywords}/${originalKeywords.size}`,
      keywordSimilarity: Math.round(keywordSimilarity * 100),
    },
  };
};

module.exports = {
  searchRetailStore,
  searchRetailStoreClientSide,
  normalizeQuery,
  analyzeProductMatch,
};
