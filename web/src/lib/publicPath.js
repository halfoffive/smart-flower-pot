/**
 * 应用部署路径前缀
 *
 * 使用 Vite 构建时注入的 BASE_URL：
 * - Cloudflare Pages（域名根目录）：BASE_URL = "/"
 * - GitHub Pages（子目录）：       BASE_URL = "/smart-flower-pot/"
 *
 * 所有静态资源路径都通过此模块拼接，确保跨部署环境兼容。
 * 不要硬编码 "/" 开头的绝对路径——它们在子目录部署下会 404。
 */
export const publicPath = import.meta.env.BASE_URL
