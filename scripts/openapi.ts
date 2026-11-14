// Prints the contract generated from the routes; `npm run contract:update` saves it
// as openapi.json, and scripts/check.sh fails when the two differ.
import { openapi } from "../src/app.js";

process.stdout.write(JSON.stringify(openapi(), null, 2) + "\n");
