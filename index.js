const express = require("express");
const cors = require("cors");
require("dotenv").config();
const app = express();
const PORT = process.env.PORT || 3000;

// Services
const { isUngatedASIN, fetchAmazonProduct } = require("./services/amazon");
const { searchWalmart } = require("./services/retailers/walmart");
const { searchCanadianTire } = require("./services/retailers/canadianTire");

// Middleware
app.use(
  cors({
    origin: "*",
    methods: "*",
    allowedHeaders: "*",
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.get("/", (req, res) => {
  res.json({ message: "Welcome to Node Helper API" });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "Server is running" });
});

// Endpoint to check ungate status for ASIN
app.get("/api/asin/ungate-status", async (req, res) => {
  try {
    const { asin, condition = "new" } = req.query;

    if (!asin) {
      return res.status(400).json({ error: "ASIN parameter is required" });
    }

    const isUngated = await isUngatedASIN(asin, condition);
    res.json({
      asin,
      condition,
      isUngated,
    });
  } catch (error) {
    console.error("Error checking ungate status:", error);
    res.status(500).json({ error: "Failed to check ungate status" });
  }
});

// Endpoint to check product availability across Canadian retail stores
app.get("/api/asin/availability", async (req, res) => {
  try {
    const { asin } = req.query;

    if (!asin) {
      return res.status(400).json({ error: "ASIN parameter is required" });
    }

    // Fetch product from Amazon.ca
    const amazonProduct = await fetchAmazonProduct(asin);

    if (!amazonProduct.success) {
      return res.status(404).json({
        error: "Could not fetch product from Amazon.ca",
        details: amazonProduct.error,
      });
    }

    // Search across Canadian retail stores
    const walmartAvailability = await searchWalmart(amazonProduct.title);
    const canadianTireAvailability = await searchCanadianTire(
      amazonProduct.title,
    );

    // Calculate overall availability probability
    // Start with the store results and accumulate
    const storeResults = [walmartAvailability, canadianTireAvailability];
    const availableStores = storeResults.filter(
      (store) => store.available,
    ).length;
    const totalStores = storeResults.length;
    const availabilityProbability = (availableStores / totalStores) * 100;

    res.json({
      asin,
      productTitle: amazonProduct.title,
      productPrice: amazonProduct.price,
      storeAvailability: storeResults,
      availabilityProbability: availabilityProbability.toFixed(2) + "%",
      summary: {
        availableIn: availableStores,
        totalStoresChecked: totalStores,
      },
    });
  } catch (error) {
    console.error("Error checking availability:", error);
    res.status(500).json({ error: "Failed to check product availability" });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Something went wrong!" });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
