const express = require("express");
const cors = require("cors");
require("dotenv").config();
const app = express();
const PORT = process.env.PORT || 3000;

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

// Helper function to check if ASIN is ungated
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
