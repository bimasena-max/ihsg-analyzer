// next.config.js
// onnxruntime-node adalah native module (binding .node terkompilasi) —
// TIDAK boleh di-bundle webpack seperti kode JS biasa. Kalau tidak
// di-external-kan di sini, build kemungkinan besar gagal atau berhasil
// build tapi crash saat runtime ("invalid ELF header" / module not found).
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ['onnxruntime-node'],
    // /api/ml-insight membaca JSON dari disk dengan path yang dihitung saat runtime
    // (process.cwd() + nama berkas), yang tidak selalu terdeteksi oleh file tracing
    // Vercel. Sebut eksplisit supaya kartu model & riwayat prediksi ikut terbawa.
    outputFileTracingIncludes: {
      '/api/ml-insight': ['./ml/models/*.json', './data/predictions/*.json'],
      // screener.js memuat model_<h>.onnx dengan nama berkas yang disusun saat runtime,
      // dan file tracing Next TIDAK ikut membawanya ke function Vercel (sudah diuji).
      // Tanpa baris ini modelnya tidak ada di server -> "Model ML belum tersedia".
      '/api/screener': ['./ml/models/*.onnx'],
    },
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
