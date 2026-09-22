use tauri::Manager;

#[derive(serde::Serialize)]
struct MonitorInfo {
  name: Option<String>,
  current: bool,
  x: i32,
  y: i32,
  width: u32,
  height: u32,
}

#[tauri::command]
fn available_monitors(app: tauri::AppHandle) -> Result<Vec<MonitorInfo>, String> {
  let current_position = app.get_webview_window("main")
    .and_then(|window| window.current_monitor().ok().flatten())
    .map(|monitor| *monitor.position());
  app.available_monitors()
    .map_err(|error| error.to_string())
    .map(|monitors| monitors.into_iter().map(|monitor| {
      let position = monitor.position();
      let size = monitor.size();
      MonitorInfo {
        name: monitor.name().cloned(),
        current: current_position == Some(*position),
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
      }
    }).collect())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![available_monitors])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
