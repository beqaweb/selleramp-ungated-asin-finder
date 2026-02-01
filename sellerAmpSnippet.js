const RUN_FOR = 60 * 5; // mins
const RATING_RANGE = [0, 10];

let hasTimedOut = false;

setTimeout(
  () => {
    hasTimedOut = true;
  },
  RUN_FOR * 60 * 1000,
);

const getMarchants = () => {
  return localStorage.getItem("MERCHANTS")
    ? JSON.parse(localStorage.getItem("MERCHANTS"))
    : [];
};

const addMerchant = (merchantId) => {
  const merchants = getMarchants();
  if (merchants.includes(merchantId)) return;
  merchants.push(merchantId);
  localStorage.setItem("MERCHANTS", JSON.stringify(merchants));
};

const getAnalyzedMerchants = () => {
  return localStorage.getItem("MERCHANTS_ANALYZED")
    ? JSON.parse(localStorage.getItem("MERCHANTS_ANALYZED"))
    : [];
};

const addAnalyzedMerchant = (merchantId) => {
  const merchants = getAnalyzedMerchants();
  if (merchants.includes(merchantId)) return;
  merchants.push(merchantId);
  localStorage.setItem("MERCHANTS_ANALYZED", JSON.stringify(merchants));
};

const getAnalyzedAsins = () => {
  return localStorage.getItem("ANALYZED_ASINS")
    ? JSON.parse(localStorage.getItem("ANALYZED_ASINS"))
    : [];
};

const addAnalyzedAsin = (asin) => {
  const asins = getAnalyzedAsins();
  if (asins.includes(asin)) return;
  asins.push(asin);
  localStorage.setItem("ANALYZED_ASINS", JSON.stringify(asins));
};

const getUngatedAsins = () => {
  return localStorage.getItem("UNGATED_ASINS")
    ? JSON.parse(localStorage.getItem("UNGATED_ASINS"))
    : [];
};

const addUngatedAsin = (asin) => {
  const asins = getUngatedAsins();
  if (asins.includes(asin)) return;
  asins.push(asin);
  localStorage.setItem("UNGATED_ASINS", JSON.stringify(asins));
};

if (typeof sleep === "undefined")
  window.sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isUngatedAsin = async (asin, condition = "new") => {
  const url = `http://localhost:3000/api/asin/ungate-status?asin=${asin}&condition=${condition.toLowerCase()}`;
  const response = await fetch(url);
  const data = await response.json();
  return data.isUngated;
};

const waitForProductList = async (timeout = 30) => {
  const hasProductList = () => Boolean(document.querySelector("#productList"));
  let counter = 0;
  while (!hasProductList() && counter < timeout) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    counter++;
  }
};

const typeSearch = async (inputText) => {
  const searchInput = document.querySelector("#saslookup-search_term");
  searchInput.value = inputText;
  searchInput.dispatchEvent(new Event("input"));
  const searchButton = document.querySelector(
    'h1.page-header button[type="submit"]',
  );
  searchButton.click();
};

const waitForOffersToLoad = async (asinLi, timeout = 10) => {
  const isLoading = () =>
    asinLi
      .querySelector(".pl-offers-col")
      .innerText.toLowerCase()
      .includes("loading");
  let counter = 0;
  while (isLoading() && counter < timeout) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    counter++;
  }
  return isLoading();
};

const hasOffers = (asinLi) => {
  return !asinLi
    .querySelector(".pl-offers-col")
    .innerText.toLowerCase()
    .includes("no offers");
};

const loadMore = () => {
  const loadMoreBtn = document.querySelector("#productList-loadmore a");
  if (!loadMoreBtn.classList.contains("disabled")) {
    loadMoreBtn.click();
    return true;
  }
  return false;
};

const getProductListElements = () => {
  const productList = document.querySelector("#productList");
  return Array.from(productList.children);
};

const getSellerRatingFromTooltipText = (tooltipText) => {
  const match = tooltipText.match(/\(([\d,]+)\)/);
  return match ? Number(match[1].replace(/,/g, "")) : null;
};

const merchantsToBeAnalyzed = [...getMarchants()];

const queueUpMerchant = (merchantId) => {
  if (!merchantsToBeAnalyzed.includes(merchantId)) {
    merchantsToBeAnalyzed.push(merchantId);
  }
};

const params = new URL(decodeURIComponent(window.location.href)).searchParams;
const initialMerchantId = params.get("me");

const analyzeMerchant = async (merchantId, isInitial = false) => {
  if (hasTimedOut) return;

  if (!isInitial && getAnalyzedMerchants().includes(merchantId)) {
    if (merchantsToBeAnalyzed.length > 0) {
      analyzeMerchant(merchantsToBeAnalyzed.shift());
    }
    return;
  }

  await typeSearch(
    `https://www.amazon.ca/s?i=merchant-items&me=${merchantId}&marketplaceID=A2EUQ1WTGCTBG2`,
  );
  await sleep(1000);

  await waitForProductList();

  const analyzeAsins = async (asinList) => {
    if (hasTimedOut) return;

    for (const asinLi of asinList) {
      if (hasTimedOut) return;

      const stillLoading = await waitForOffersToLoad(asinLi);
      if (stillLoading) continue;

      if (!hasOffers(asinLi)) continue;

      const asin = asinLi.querySelector("[asin]")?.getAttribute("asin");
      if (!asin) throw new Error("ASIN not found");

      if (getAnalyzedAsins().includes(asin)) continue;

      try {
        const isUngated = await isUngatedAsin(asin);
        if (isUngated) addUngatedAsin(asin);
      } catch {
        return;
      }

      const offersTable = asinLi.querySelector(".pl-offers-col table");
      const offers = Array.from(offersTable.querySelectorAll("tbody tr"));

      for (const offerTr of offers) {
        const sellerIdTd = offerTr.querySelector("[seller-id]");
        const sellerId = sellerIdTd.getAttribute("seller-id");

        if (sellerId === initialMerchantId) continue;

        const tooltipEl = sellerIdTd.querySelector('[data-toggle="tooltip"]');
        if (tooltipEl.getAttribute("is-amazon") === "true") continue;

        const RATING_FROM = RATING_RANGE[0];
        const RATING_TO = RATING_RANGE[1];

        const tooltipText = tooltipEl.getAttribute("data-original-title");

        if (tooltipText.trim().startsWith(sellerId)) continue;

        const rating = getSellerRatingFromTooltipText(tooltipText);

        if (!rating) {
          // new seller
          addMerchant(sellerId);
          queueUpMerchant(sellerId);
        } else {
          if (rating >= RATING_FROM && rating <= RATING_TO) {
            addMerchant(sellerId);
            queueUpMerchant(sellerId);
          }
        }
      }

      addAnalyzedAsin(asin);

      await sleep(10000); // pause for 30 secs
    }
  };

  await analyzeAsins(getProductListElements());
  while (loadMore()) {
    if (hasTimedOut) {
      break;
      return;
    }
    await sleep(500);
    await analyzeAsins(getProductListElements());
  }

  addAnalyzedMerchant(merchantId);

  analyzeMerchant(merchantsToBeAnalyzed.shift());
};

analyzeMerchant(initialMerchantId, true);
