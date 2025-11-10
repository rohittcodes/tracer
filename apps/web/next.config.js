/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@tracer/core', '@tracer/db', '@tracer/infra', '@tracer/router'],
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': require('path').resolve(__dirname, './src'),
    };
    return config;
  },
};

module.exports = nextConfig;