/**
 * Tauri 应用入口 — 注册所有插件
 *
 * 插件列表：
 * - blec: BLE 蓝牙客户端（基于 btleplug，全平台支持）
 * - serialplugin: 串口通信（跨平台串口读写）
 * - deep-link: 深度链接（URL Scheme 启动应用并自动连接）
 * - store: 持久化键值存储（保存上次连接信息）
 * - opener: 外部链接打开器
 */

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_blec::init())
        .plugin(tauri_plugin_serialplugin::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
