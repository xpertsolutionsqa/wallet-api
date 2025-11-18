const express = require("express");
const { Template } = require("@walletpass/pass-js");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

const { google } = require("googleapis");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use("/passes", express.static(path.join(__dirname, "passes")));
app.use(express.static(__dirname));

// Create passes directory if doesn't exist
if (!fs.existsSync(path.join(__dirname, "passes"))) {
  fs.mkdirSync(path.join(__dirname, "passes"));
}

// Health check
app.get("/", (req, res) => {
  res.json({ message: "Wallet Backend Running!" });
});

app.get("/test", (req, res) => {
  res.sendFile(path.join(__dirname, "test.html"));
});

// Generate pass endpoint
app.post("/generate-pass", async (req, res) => {
  try {
    const { name, phone, email } = req.body;

    // Validation
    if (!name || !phone || !email) {
      return res.status(400).json({
        error: "Missing required fields: name, phone, email",
      });
    }

    console.log(`Generating pass for: ${name}`);

    // vCard data for QR
    const vCardData = `BEGIN:VCARD
                      VERSION:3.0
                      FN:${name}
                      TEL:${phone}
                      EMAIL:${email}
                      END:VCARD`;

    // Create Template
    const template = new Template("generic", {
      passTypeIdentifier: process.env.PASS_TYPE_ID,
      teamIdentifier: process.env.TEAM_ID,
      organizationName: name,
      description: "Digital Business Card",

      // Colors
      foregroundColor: "rgb(255, 255, 255)",
      backgroundColor: "rgb(30, 136, 229)",
      labelColor: "rgb(227, 242, 253)",
    });

    // Load certificate - TEMPLATE pe load karo, PASS pe nahi
    const certPath = path.join(__dirname, "certificates", "pass.pem");

    if (!fs.existsSync(certPath)) {
      throw new Error(`Certificate not found at: ${certPath}`);
    }

    console.log("Loading certificate...");
    await template.loadCertificate(certPath, process.env.P12_PASSWORD);
    const iconPath = path.join(__dirname, "images", "icon.png");
    if (fs.existsSync(iconPath)) {
      await template.images.add("icon", iconPath);
      await template.images.add("logo", iconPath);
    } else {
      // Create a simple default icon buffer if no icon exists
      console.warn("⚠️  No icon.png found, using default");
    }

    // Create individual pass from template
    const pass = template.createPass({
      serialNumber: `BC-${Date.now()}`,
    });

    // Add barcode (QR Code)
    pass.barcodes = [
      {
        format: "PKBarcodeFormatQR",
        message: vCardData,
        messageEncoding: "iso-8859-1",
      },
    ];

    // Add fields
    pass.primaryFields.add({
      key: "name",
      label: "Name",
      value: name,
    });

    pass.secondaryFields.add({
      key: "phone",
      label: "Phone",
      value: phone,
    });

    pass.auxiliaryFields.add({
      key: "email",
      label: "Email",
      value: email,
    });

    // Generate pass buffer
    console.log("Generating .pkpass file...");
    const buffer = await pass.asBuffer();

    // Save to file
    const fileName = `businesscard-${Date.now()}.pkpass`;
    const filePath = path.join(__dirname, "passes", fileName);

    fs.writeFileSync(filePath, buffer);

    console.log(`✅ Pass generated: ${fileName}`);

    // Get local IP for mobile access
    // const localIP = getLocalIP();
    // const passUrl = `http://${localIP}:${PORT}/passes/${fileName}`;

    const baseUrl =
      process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
    const passUrl = `${baseUrl}/passes/${fileName}`;

    res.json({
      success: true,
      passUrl: passUrl,
      fileName: fileName,
    });
  } catch (error) {
    console.error("❌ Error generating pass:", error);
    res.status(500).json({
      error: "Failed to generate pass",
      details: error.message,
      stack: error.stack,
    });
  }
});

// C7ASMnxF;
// Test endpoint with hardcoded data
app.get("/test-pass", async (req, res) => {
  try {
    console.log("🧪 Generating TEST pass with hardcoded data...");

    const name = "Ahmad Khan";
    const phone = "+974 5555 1234";
    const email = "ahmad@alibinali.com";

    // vCard data for QR
    const vCardData = `BEGIN:VCARD
                       VERSION:3.0
                       FN:${name}
                       TEL:${phone}
                       EMAIL:${email}
                       ORG:Ali Bin Ali Holding
                       END:VCARD`;

    // Create Template
    const template = new Template("generic", {
      passTypeIdentifier: process.env.PASS_TYPE_ID,
      teamIdentifier: process.env.TEAM_ID,
      organizationName: "Ali Bin Ali",
      description: "Digital Business Card",
      foregroundColor: "rgb(255, 255, 255)",
      backgroundColor: "rgb(30, 136, 229)",
      labelColor: "rgb(227, 242, 253)",
    });

    // Load certificate
    const certPath = path.join(__dirname, "certificates", "pass.pem");

    if (!fs.existsSync(certPath)) {
      throw new Error(`Certificate not found at: ${certPath}`);
    }

    console.log("Loading certificate...");
    await template.loadCertificate(certPath, process.env.P12_PASSWORD);

    // Load icon if exists
    const iconPath = path.join(__dirname, "images", "icon.png");
    if (fs.existsSync(iconPath)) {
      await template.images.add("icon", iconPath);
      await template.images.add("logo", iconPath);
    }

    // Create individual pass
    const pass = template.createPass({
      serialNumber: `TEST-${Date.now()}`,
    });

    // Add barcode
    pass.barcodes = [
      {
        format: "PKBarcodeFormatQR",
        message: vCardData,
        messageEncoding: "iso-8859-1",
      },
    ];

    // Add fields
    pass.primaryFields.add({
      key: "name",
      label: "Name",
      value: name,
    });

    pass.secondaryFields.add({
      key: "phone",
      label: "Phone",
      value: phone,
    });

    pass.auxiliaryFields.add({
      key: "email",
      label: "Email",
      value: email,
    });

    // Generate buffer
    console.log("Generating .pkpass file...");
    const buffer = await pass.asBuffer();

    // Save file
    const fileName = `test-businesscard.pkpass`;
    const filePath = path.join(__dirname, "passes", fileName);
    fs.writeFileSync(filePath, buffer);

    console.log(`✅ Test pass generated: ${fileName}`);
    console.log(`📦 File size: ${buffer.length} bytes`);

    // Set headers for direct download
    res.setHeader("Content-Type", "application/vnd.apple.pkpass");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="ABA-TestCard.pkpass"'
    );
    res.setHeader("Content-Length", buffer.length);

    // Send buffer directly
    res.send(buffer);
  } catch (error) {
    console.error("❌ Error generating test pass:", error);
    res.status(500).json({
      error: "Failed to generate test pass",
      details: error.message,
      stack: error.stack,
    });
  }
});

// Alternative: Serve saved file
app.get("/download-test", (req, res) => {
  const filePath = path.join(__dirname, "passes", "test-businesscard.pkpass");

  if (!fs.existsSync(filePath)) {
    return res.status(404).send("Test pass not found. Visit /test-pass first.");
  }

  res.download(filePath, "ABA-TestCard.pkpass", (err) => {
    if (err) {
      console.error("Download error:", err);
    }
  });
});

let googleServiceAccount;
try {
  googleServiceAccount = require(process.env.GOOGLE_SERVICE_ACCOUNT_FILE);
  console.log("✅ Google Service Account loaded");
} catch (e) {
  console.warn(
    "⚠️  Google Service Account not found - Android wallet disabled"
  );
}

// Android: Generate Google Wallet Pass
app.post("/generate-google-pass", async (req, res) => {
  try {
    const { name, phone, email } = req.body;

    if (!name || !phone || !email) {
      return res.status(400).json({
        error: "Missing required fields",
      });
    }

    if (!googleServiceAccount) {
      return res.status(500).json({
        error: "Google Wallet not configured",
      });
    }

    console.log(`Generating Google Wallet pass for: ${name}`);

    const issuerId = process.env.GOOGLE_ISSUER_ID;
    const classId = `${issuerId}.business_card_class`;
    const objectId = `${issuerId}.${Date.now()}_${name.replace(/\s/g, "_")}`;

    // vCard for barcode
    const vCardData = `BEGIN:VCARD
VERSION:3.0
FN:${name}
TEL:${phone}
EMAIL:${email}
END:VCARD`;

    // Create Generic Class (one-time setup, can be reused)
    const genericClass = {
      id: classId,
      classTemplateInfo: {
        cardTemplateOverride: {
          cardRowTemplateInfos: [
            {
              oneItem: {
                item: {
                  firstValue: {
                    fields: [
                      {
                        fieldPath: "object.textModulesData['name']",
                      },
                    ],
                  },
                },
              },
            },
            {
              twoItems: {
                startItem: {
                  firstValue: {
                    fields: [
                      {
                        fieldPath: "object.textModulesData['phone']",
                      },
                    ],
                  },
                },
                endItem: {
                  firstValue: {
                    fields: [
                      {
                        fieldPath: "object.textModulesData['email']",
                      },
                    ],
                  },
                },
              },
            },
          ],
        },
      },
    };

    // Create Generic Object (individual pass)
    const genericObject = {
      id: objectId,
      classId: classId,
      genericType: "GENERIC_TYPE_UNSPECIFIED",
      hexBackgroundColor: "#1E88E5",
      logo: {
        sourceUri: {
          uri: "https://via.placeholder.com/150/1E88E5/FFFFFF?text=BC",
        },
      },
      cardTitle: {
        defaultValue: {
          language: "en-US",
          value: "Business Card",
        },
      },
      header: {
        defaultValue: {
          language: "en-US",
          value: name,
        },
      },
      textModulesData: [
        {
          id: "name",
          header: "Name",
          body: name,
        },
        {
          id: "phone",
          header: "Phone",
          body: phone,
        },
        {
          id: "email",
          header: "Email",
          body: email,
        },
      ],
      barcode: {
        type: "QR_CODE",
        value: vCardData,
      },
    };

    // Create JWT
    const claims = {
      iss: process.env.CLIENT_EMAIL,
      aud: "google",
      origins: [],
      typ: "savetowallet",
      payload: {
        genericClasses: [genericClass],
        genericObjects: [genericObject],
      },
    };

    const token = jwt.sign(claims, process.env.PRIVATE_KEY, {
      algorithm: "RS256",
    });

    const saveUrl = `https://pay.google.com/gp/v/save/${token}`;

    console.log("✅ Google Wallet pass generated");

    res.json({
      success: true,
      saveUrl: saveUrl,
      token: token,
    });
  } catch (error) {
    console.error("❌ Error generating Google pass:", error);
    res.status(500).json({
      error: "Failed to generate pass",
      details: error.message,
    });
  }
});

// Helper function to get local IP
function getLocalIP() {
  const { networkInterfaces } = require("os");
  const nets = networkInterfaces();

  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === "IPv4" && !net.internal) {
        return net.address;
      }
    }
  }
  return "localhost";
}

// Start server
app.listen(PORT, "0.0.0.0", () => {
  const localIP = getLocalIP();
  console.log(`
╔════════════════════════════════════════╗
║   Wallet Backend Server Running!       ║
╚════════════════════════════════════════╝

Local:   http://localhost:${PORT}
Network: http://${localIP}:${PORT}

Endpoints:
  POST /generate-pass - Generate new pass
  
Certificate Location: ./certificates/pass.pem
  `);
});
