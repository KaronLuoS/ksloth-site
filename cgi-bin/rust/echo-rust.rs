use std::env;
use std::io::{self, Read};
use std::process::Command;

fn main() {

    println!("Cache-Control: no-cache");
    println!("Content-Type: text/plain\n");


    let method = env::var("REQUEST_METHOD").unwrap_or_else(|_| String::from("UNKNOWN"));
    let host = env::var("HTTP_HOST").unwrap_or_else(|_| env::var("SERVER_NAME").unwrap_or_else(|_| String::from("Unknown Host")));
    let user_agent = env::var("HTTP_USER_AGENT").unwrap_or_else(|_| String::from("Unknown Agent"));
    let ip = env::var("REMOTE_ADDR").unwrap_or_else(|_| String::from("Unknown IP"));
    
    let date = Command::new("date")
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_else(|_| String::from("Unknown Time"));

    let mut payload = String::new();
    
    if method == "GET" {
        payload = env::var("QUERY_STRING").unwrap_or_else(|_| String::from(""));
    } else {
        let _ = io::stdin().read_to_string(&mut payload);
    }


    println!("=== Request Metadata ===");
    println!("Method: {}", method);
    println!("Hostname: {}", host);
    println!("Time: {}", date);
    println!("User Agent: {}", user_agent);
    println!("IP Address: {}", ip);
    
    println!("\n=== Received Data ===");
    if payload.is_empty() {
        println!("(No data received)");
    } else {
        println!("{}", payload);
    }
}