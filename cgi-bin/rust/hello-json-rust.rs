use std::env;
use std::process::Command;

fn main(){

    println!("Cache-Control: no-cache");
    println!("Content-Type: application/json\n");

    let date = Command::new("date")
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_else(|_| String::from("Unknown Time"));
    
    let address = env::var("REMOTE_ADDR").unwrap_or_else(|_| String::from("Unknown IP"));

    println!(r#"{{
        "title": "Hello, there!",
        "heading": "Hello, rust!",
        "message": "This page was generated with the Rust programming language and Karon wrote the code ;)",
        "time": {}, 
        "IP": {}
    }}"#, date, address);
}