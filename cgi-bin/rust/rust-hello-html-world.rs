use std::env;
use std::process::Command;

fn main() {

    println!("Cache-Control: no-cache");
    println!("Content-Type: text/html\n"); 

    let date = Command::new("date")
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_else(|_| String::from("Unknown Time"));

    let address = env::var("REMOTE_ADDR").unwrap_or_else(|_| String::from("Unknown IP"));


    print!(r#"<!DOCTYPE html>
    <html>
    <head>
    <title>Hello CGI World</title>
    </head>
    <body>
    <h1 align="center">Hello HTML World</h1><hr/>
    <p>Hello World</p>
    <p>This page was generated with the Rust programming language, and karon wrote this code ;P</p>
    <p>This program was generated at: {}</p>
    <p>Your current IP Address is: {}</p>
    </body>
    </html>"#, date, address);
}