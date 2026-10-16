# 🌍 GreenMap AI — Sustainable Energy Optimization Platform

### 🚀 Live Demo Deployment: [green-map-ai-five.vercel.app](https://green-map-ai-five.vercel.app/)

**GreenMap AI** is an advanced geospatial dashboard built for a clean-energy hackathon to streamline utility-scale solar farm land prospecting in Karnataka, India. The project solves the bottleneck of traditional site screening—shifting months of manual engineering guesswork into seconds of data-driven certainty.

Our application runs entirely **on-device on client infrastructure**, calculating complex environmental analytics and executing large language model inference **100% offline inside the browser**.

---

## 🚀 Key Technical Pillars (Hackathon Rubric)

### 👁️ 1. Computer Vision & Spatial Scanning
The platform executes high-resolution topographic image processing on our layers. It actively visualizes slope gradients on a crisp **Terrain Height Map**, automatically flagging steep, unbuildable mountain ridges in solid red, warning hills in orange, and flat terrain parcels optimized for solar tracking arrays in translucent green.

### 📡 2. Real Environmental Sensor Data
We stripped away all placeholder values and built a genuine, localized environmental data profile using official **KREDL and Global Solar Atlas spreadsheets**. The data averages and maps authentic regional sensor telemetries directly across 30 administrative districts:

* **Altitude / Elevation (m):** Tracks height above sea level to calculate cooling efficiency multipliers.
* **Global Horizontal Irradiation (GHI):** Total solar radiation received by a flat horizontal surface.
* **Direct Normal Irradiation (DNI):** Pure, un-scattered solar beams critical for active dual-axis tracking rigs.

### 🏢 3. Interactive Digital Twin Simulation
The core map works as a dynamic virtual twin of the region's green infrastructure. The moment a district is optimized, a geometric placement model calculates an urban exclusion buffer away from city streets and automatically draws a grid-scale layout blueprint:
* **Panels Matrix:** A perfectly spaced grid array of blue photovoltaic circle markers scaled to match the site's environmental score.
* **Power Substation:** A high-visibility central routing asset anchored near transmission routes.
* **Micro-Grid Cabling:** Sleek, grid-aligned neon-yellow polyline arrays routing panel strings directly into the sub-station and matching city infrastructure nodes.
* **Hardware Sizing Card:** Instantly outputs calculated capacity indicators, measuring farm scale in acres, panel counts, and energy yield in Megawatts (MW).

### 🤖 4. Edge Generative AI (Our Core USP)
* **The Model:** `HuggingFaceTB/SmolLM2-135M-Instruct`
* **On-Device Inference:** Powered by **Transformers.js**, the platform downloads the compact open-source model straight into the browser’s local cache storage on its first execution thread. 
* **100% Private, Latency-Free, and Free:** The model runs locally via a background **Web Worker thread** using the client computer's processor. It requires zero external cloud API keys, zero monthly server bills, and can never crash or lag during live presentations.
* **Unscripted Expert Briefs:** Clicking "Run Hugging Face AI Optimization" triggers the model to parse the raw Excel sensor metrics and generate a unique, 2-sentence engineering brief summarizing the region's climate strengths and monsoon overcast risks.

---

## 🛠️ The Technology Stack

* **Core Framework:** React (TypeScript) + Vite
* **Design & Styling:** Tailwind CSS (Clean enterprise dark slate & emerald theme)
* **Mapping Engine:** Leaflet API + High-Fidelity Custom GeoJSON Boundary Vectors
* **Machine Learning Runtime:** `@huggingface/transformers` (JavaScript WASM execution engine)

---

## 🔄 Live Presentation Flow (The Reset Pipeline)
To allow for seamless, back-to-back live interview demonstrations, the application features an instant **"Reset Solar Analysis" button** inside the sidebar and report views. Clicking it instantly flushes the active vector paths and resets the district button triggers to pristine state, while keeping the heavy Hugging Face model weights safely preserved in the browser's storage cache for instantaneous, offline rerun cycles.

---

## 📦 Local Installation & Setup

Clone the repository and install the dependencies locally on your machine:

```bash
# Clone the repository
git clone https://github.com

# Enter the directory
cd greenmap-ai

# Install the on-device AI and map engine dependencies
npm install


# Run the development server
npm run dev
```

Open `http://localhost:5173` in your browser to test the interactive digital twin simulation!
