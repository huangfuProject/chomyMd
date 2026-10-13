const path = require("node:path");
const fs = require("node:fs/promises");
const portableCross = process.env.CHOMY_PORTABLE_CROSS === "1";
const signing = process.env.APPLE_SIGNING_IDENTITY;
const notarize =
  process.env.APPLE_ID &&
  process.env.APPLE_APP_PASSWORD &&
  process.env.APPLE_TEAM_ID;
if (
  process.env.CHOMY_PUBLIC_RELEASE === "1" &&
  process.platform === "darwin" &&
  (!signing || !notarize)
)
  throw new Error(
    "Public macOS release requires signing and notarization credentials.",
  );
if (
  process.env.CHOMY_PUBLIC_RELEASE === "1" &&
  process.platform === "win32" &&
  !process.env.WINDOWS_CERTIFICATE_FILE
)
  throw new Error("Public Windows release requires a signing certificate.");
module.exports = {
  packagerConfig: {
    asar: true,
    prune: false,
    executableName: "Chomy",
    appBundleId: "io.chomy.editor",
    ...(!portableCross ? { icon: path.join(__dirname, "assets", "icon") } : {}),
    ignore: [
      /^\/node_modules(?:\/|$)/,
      /^\/src(?:\/|$)/,
      /^\/out(?:\/|$)/,
      /^\/forge\.config\.cjs$/,
    ],
    ...(signing
      ? {
          osxSign: {
            identity: signing,
            optionsForFile: () => ({
              hardenedRuntime: true,
              entitlements: path.join(
                __dirname,
                "assets",
                "entitlements.plist",
              ),
            }),
          },
        }
      : {}),
    ...(notarize
      ? {
          osxNotarize: {
            appleId: process.env.APPLE_ID,
            appleIdPassword: process.env.APPLE_APP_PASSWORD,
            teamId: process.env.APPLE_TEAM_ID,
          },
        }
      : {}),
    extendInfo: {
      CFBundleDocumentTypes: [
        {
          CFBundleTypeName: "Markdown document",
          CFBundleTypeRole: "Editor",
          LSHandlerRank: "Alternate",
          LSItemContentTypes: ["net.daringfireball.markdown"],
          CFBundleTypeExtensions: ["md", "markdown"],
        },
      ],
    },
    ...(!portableCross
      ? {
          win32metadata: {
            CompanyName: "Chomy",
            FileDescription: "Chomy Markdown editor",
            ProductName: "Chomy",
          },
        }
      : {}),
  },
  hooks: {
    preMake: async () => {
      if (process.platform !== "win32") return;
      // Squirrel expects unqualified names; pnpm does not run this vendor setup.
      const vendor = path.join(
        path.dirname(require.resolve("electron-winstaller/package.json")),
        "vendor",
      );
      if (!["x64", "arm64"].includes(process.arch))
        throw new Error(`Unsupported Squirrel build host: ${process.arch}`);
      for (const extension of ["exe", "dll"])
        await fs.copyFile(
          path.join(vendor, `7z-${process.arch}.${extension}`),
          path.join(vendor, `7z.${extension}`),
        );
    },
  },
  makers: [
    { name: "@electron-forge/maker-zip", platforms: ["darwin", "win32"] },
    {
      name: "@electron-forge/maker-squirrel",
      platforms: ["win32"],
      config: {
        name: "Chomy",
        authors: "Chomy contributors",
        description: "Local-first Markdown editor",
        setupIcon: path.join(__dirname, "assets", "icon.ico"),
        ...(process.env.WINDOWS_CERTIFICATE_FILE
          ? {
              certificateFile: process.env.WINDOWS_CERTIFICATE_FILE,
              certificatePassword: process.env.WINDOWS_CERTIFICATE_PASSWORD,
            }
          : {}),
      },
    },
  ],
};
