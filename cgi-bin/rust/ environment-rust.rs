use std::env;

fn main(){

    println!("Cache-Control: no-cache");
    println!("Content-type: text/html \n");

    println!(r#"<!DOCTYPE html>
    <html>
    <head>
        <title>Environment Variables</title>
    </head>
    <body>
    <h1 align="center">Environment Variables with Rust :)</h1>
    <hr>
    "#);
    for (key, value) in env::vars() {
        println!("<b>{key}: </b> {value} <br />");
    }
    println!(r#"
    </body>
    </html>"#);
}