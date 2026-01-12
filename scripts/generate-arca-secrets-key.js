// scripts/generate-arca-secrets-key.js
import("crypto")
  .then(({ randomBytes }) => {
    const key = randomBytes(32).toString("base64");
    // Print only the key, so it can be pasted into env files.
    console.log(key);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
