module.exports = function (api) {
  api.cache(true);

  return {
    presets: [
      [
        'babel-preset-expo',
        {
          // SDK 54/55 otherwise leave import.meta in Zustand's ESM middleware bundle.
          unstable_transformImportMeta: true,
        },
      ],
    ],
  };
};
