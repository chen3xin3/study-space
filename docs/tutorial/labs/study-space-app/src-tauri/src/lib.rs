pub fn health_message() -> &'static str {
    "教学版后端已连接"
}

#[tauri::command]
fn health_check_command() -> &'static str {
    health_message()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![health_check_command])
        .run(tauri::generate_context!())
        .expect("教学版 Tauri 应用启动失败");
}

#[cfg(test)]
mod tests {
    use super::health_message;

    #[test]
    fn health_message_confirms_the_teaching_backend() {
        assert_eq!(health_message(), "教学版后端已连接");
    }
}
