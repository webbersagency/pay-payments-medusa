module.exports = {
  transform: {
    "^.+\\.[jt]sx?$": ["ts-jest", {tsconfig: "tsconfig.spec.json"}],
  },
  testMatch: ["**/?(*.)+(spec|test).[jt]s?(x)"],
  testEnvironment: "node",
  moduleFileExtensions: ["js", "jsx", "ts", "tsx", "json"],
  modulePathIgnorePatterns: ["<rootDir>/.medusa"],
}
