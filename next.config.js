// next.config.js
// onnxruntime-node adalah native module (binding .node terkompilasi) —
// TIDAK boleh di-bundle webpack seperti kode JS biasa. Kalau tidak
// di-external-kan di sini, build kemungkinan besar gagal atau berhasil
// build tapi crash saat runtime ("invalid ELF header" / module not found).
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ['onnxruntime-node'],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push('onnxruntime-node');
    }
    return config;
  },
};

module.exports = nextConfig;
