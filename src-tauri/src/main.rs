// Sin ventana de consola en Windows (release).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    comboy_erp_lib::run()
}
