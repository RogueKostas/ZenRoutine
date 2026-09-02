module.exports = function (api) {
  api.cache(true);

  return {
    presets: [
      [
        'babel-preset-expo',
        {
          // SDK 54 otherwise leaves import.meta in Zustand's ESM middleware bundle.
          unstable_transformImportMeta: true,
        },
      ],
    ],
  };
};
