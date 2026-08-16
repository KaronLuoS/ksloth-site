use std::env;
use std::fs;
use std::io::{self, Read};
use std::time::SystemTime;
use std::process;

fn get_session_id() -> Option<String> {
    if let Ok(cookie_hdr) = env::var("HTTP_COOKIE") {
        for part in cookie_hdr.split(';') {
            let part = part.trim();
            if let Some(stripped) = part.strip_prefix("session_id=") {
                return Some(stripped.to_string());
            }
        }
    }
    None
}

fn main() {

    let qs = env::var("QUERY_STRING").unwrap_or_default();
    
    // Manage Session ID
    let mut sid = get_session_id();
    let mut set_cookie_header = String::new();

    if sid.is_none() && qs.contains("action=save") {
        // Create a unique ID using the current time and process ID credit from gemini ;)
        let time = SystemTime::now().duration_since(SystemTime::UNIX_EPOCH).unwrap().as_micros();
        let pid = process::id();
        let generated_sid = format!("{}_{}", time, pid);
        
        set_cookie_header = format!("Set-Cookie: session_id={}; Path=/;", generated_sid);
        sid = Some(generated_sid);
    }

    // If clearing the session, overwrite the cookie with an expired date
    if qs.contains("action=clear") {
        set_cookie_header = String::from("Set-Cookie: session_id=; Path=/; Max-Age=0;");
    }


    println!("Cache-Control: no-cache");
    println!("Content-Type: text/html");
    if !set_cookie_header.is_empty() {
        println!("{}", set_cookie_header);
    }
    println!(); 


    println!("<html><head><title>Rust State Demo</title></head><body style=\"font-family: sans-serif; padding: 20px;\">");
    println!("<h2>Rust Server-Side State Demo</h2>");
    println!("<nav>");
    println!("  <a href=\"?\">1. Enter Data</a> | ");
    println!("  <a href=\"?action=view\">2. View Saved Data</a> | ");
    println!("  <a href=\"?action=clear\">3. Clear Session</a>");
    println!("</nav><hr>");


    
    if qs.contains("action=save") {
        // Handle form submission and save to file
        let mut body = String::new();
        io::stdin().read_to_string(&mut body).unwrap_or_default();
        
        // Basic parsing: remove the input name and convert '+' to spaces
        let parsed_data = body.replace("user_data=", "").replace("+", " ");
        
        if let Some(id) = &sid {
            let filepath = format!("/tmp/rust_sess_{}.txt", id);
            // Write the data to a file on the server
            fs::write(filepath, parsed_data).unwrap_or_default();
            println!("<p> Data successfully saved to the server!</p>");
            println!("<p><a href=\"?action=view\">Click here to view it on the next screen.</a></p>");
        }

    } else if qs.contains("action=view") {
        // Read from the server file
        if let Some(id) = &sid {
            let filepath = format!("/tmp/rust_sess_{}.txt", id);
            // Attempt to read the physical file
            if let Ok(data) = fs::read_to_string(filepath) {
                println!("<p><strong>Data retrieved from server file:</strong></p>");
                println!("<blockquote style=\"background: #f0f0f0; padding: 10px;\">{}</blockquote>", data);
            } else {
                println!("<p>Session is active, but no data file was found. Did you save data yet?</p>");
            }
        } else {
            println!("<p>No active session. Please go to the Enter Data screen.</p>");
        }

    } else if qs.contains("action=clear") {
        //  Destroy the session
        if let Some(id) = &sid {
            let filepath = format!("/tmp/rust_sess_{}.txt", id);
            // Delete the file from the server
            let _ = fs::remove_file(filepath);
        }
        println!("<p>Session cleared and server data file deleted.</p>");

    } else {
        // DEFAULT: The Input Form
        println!(r#"
        <form method="POST" action="?action=save">
            <label><strong>Enter some text to save on the server:</strong></label><br><br>
            <input type="text" name="user_data" required style="padding: 5px; width: 300px;">
            <button type="submit" style="padding: 5px 10px;">Save Data</button>
        </form>
        "#);
    }

    println!("</body></html>");
}