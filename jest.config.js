const esModules = ["@org/somelibrary1", "@org/somelibrary2"].join("|");

export default {
  transform: {
    "^.+\\.(m?js|ts)$": "babel-jest", // transpile mjs, mts, js, ts files
  },
  transformIgnorePatterns: [`/node_modules/(?!${esModules})`],
  coveragePathIgnorePatterns: [
    "<rootDir>/src/config",
    "<rootDir>/src/model",
    "<rootDir>/src/test",
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};
