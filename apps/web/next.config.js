/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@tracer/core', '@tracer/db', '@tracer/infra', '@tracer/router'],
};

module.exports = nextConfig;