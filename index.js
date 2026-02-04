const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
require("dotenv").config();
const app = express();
const PORT = process.env.PORT || 3000;

// Services
const { isUngatedASIN } = require("./services/amazon");
const {
  checkCanadianAvailability,
  connectToChrome,
} = require("./services/googleAvailability");

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

// Endpoint to check product availability across Canadian retail stores (via Google Search)
app.get("/api/asin/availability", async (req, res) => {
  try {
    const { asin } = req.query;

    if (!asin) {
      return res.status(400).json({ error: "ASIN parameter is required" });
    }

    // Check Canadian availability (fetches Amazon ASIN page + Google Search)
    const availabilityResult = await checkCanadianAvailability(asin);

    if (!availabilityResult.productTitle) {
      return res.status(404).json({
        error: "Could not fetch product from Amazon.ca",
        details: availabilityResult.message,
      });
    }

    res.json({
      asin,
      productTitle: availabilityResult.productTitle,
      productPrice: availabilityResult.productPrice,
      availableInCanada: availabilityResult.available,
      availabilityConfidence: availabilityResult.confidence + "%",
      retailersFound: availabilityResult.retailersFound,
      message: availabilityResult.message,
      totalSearchResults: availabilityResult.totalResults,
    });
  } catch (error) {
    console.error("Error checking availability:", error);
    res.status(500).json({ error: "Failed to check product availability" });
  }
});

// Endpoint to filter ASINs from ASIN_SOURCE.txt by Canadian availability
app.get("/api/asin/filter-available", async (req, res) => {
  let browser;
  try {
    const filePath = path.join(
      __dirname,
      "asin-availability",
      "ASIN_SOURCE.txt",
    );

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "ASIN_SOURCE.txt not found" });
    }

    const content = fs.readFileSync(filePath, "utf-8");
    const asins = content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    console.log(`Processing ${asins.length} ASINs...`);

    const availableASINs = [];
    const unavailableASINs = [];
    const errorASINs = [];

    // Open browser once for all ASINs
    browser = await connectToChrome();

    for (const asin of asins) {
      try {
        // Check Canadian availability using the shared browser instance
        const availabilityResult = await checkCanadianAvailability(
          asin,
          browser,
        );

        if (!availabilityResult.productTitle) {
          errorASINs.push(
            `https://www.amazon.ca/dp/${asin} (Error: ${availabilityResult.message})`,
          );
          continue;
        }

        if (availabilityResult.available) {
          availableASINs.push(`https://www.amazon.ca/dp/${asin}`);
          console.log(`✓ Available: ${asin}`);
        } else {
          unavailableASINs.push(`https://www.amazon.ca/dp/${asin}`);
          console.log(`✗ Unavailable: ${asin}`);
        }
      } catch (error) {
        errorASINs.push(
          `https://www.amazon.ca/dp/${asin} (Error: ${error.message})`,
        );
        console.error(`Error processing ${asin}:`, error.message);
      }
    }

    // Close browser after all ASINs are processed
    if (browser) {
      await browser.close();
    }

    // Write results to asin-availability directory
    const outputDir = path.join(__dirname, "asin-availability");

    // Write available ASINs
    fs.writeFileSync(
      path.join(outputDir, "ASIN_AVAILABLE.txt"),
      availableASINs.join("\n"),
      "utf-8",
    );

    // Write unavailable ASINs
    fs.writeFileSync(
      path.join(outputDir, "ASIN_UNAVAILABLE.txt"),
      unavailableASINs.join("\n"),
      "utf-8",
    );

    // Write error ASINs
    fs.writeFileSync(
      path.join(outputDir, "ASIN_ERRORS.txt"),
      errorASINs.join("\n"),
      "utf-8",
    );

    res.json({
      message: "Filtering complete",
      summary: {
        totalASINs: asins.length,
        available: availableASINs.length,
        unavailable: unavailableASINs.length,
        errors: errorASINs.length,
      },
      files: {
        available: "asin-availability/ASIN_AVAILABLE.txt",
        unavailable: "asin-availability/ASIN_UNAVAILABLE.txt",
        errors: "asin-availability/ASIN_ERRORS.txt",
      },
    });
  } catch (error) {
    // Close browser if an error occurs
    if (browser) {
      await browser.close();
    }
    console.error("Error filtering ASINs:", error);
    res.status(500).json({ error: "Failed to filter ASINs" });
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
