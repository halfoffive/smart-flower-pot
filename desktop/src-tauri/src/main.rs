// Windows 发布模式下隐藏控制台窗口，请勿删除
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    smart_flower_pot_lib::run()
}
