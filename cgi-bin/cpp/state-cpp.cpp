#include <iostream>
#include <fstream>
#include <sstream>
#include <string>
#include <cstdlib>
#include <chrono>
#include <unistd.h>
#include <cstdio>

// Helper to safely extract session_id from HTTP_COOKIE
std::string get_session_id() {
    const char* cookie_hdr = std::getenv("HTTP_COOKIE");
    if (!cookie_hdr) return "";

    std::string cookies(cookie_hdr);
    std::istringstream stream(cookies);
    std::string part;

    while (std::getline(stream, part, ';')) {
        // Trim leading spaces
        size_t start = part.find_first_not_of(" \t");
        if (start != std::string::npos) {
            part = part.substr(start);
        }

        size_t eq_pos = part.find('=');
        if (eq_pos != std::string::npos) {
            std::string name = part.substr(0, eq_pos);
            std::string value = part.substr(eq_pos + 1);
            if (name == "session_id") {
                return value;
            }
        }
    }
    return "";
}

int main() {

    const char* qs_raw = std::getenv("QUERY_STRING");
    std::string qs = qs_raw ? qs_raw : "";


    std::string sid = get_session_id();
    std::string set_cookie_header = "";

    if (sid.empty() && qs.find("action=save") != std::string::npos) {
        auto now = std::chrono::high_resolution_clock::now().time_since_epoch();
        long long timestamp = std::chrono::duration_cast<std::chrono::nanoseconds>(now).count();
        pid_t pid = getpid();
        
        sid = std::to_string(timestamp) + "_" + std::to_string(pid);
        set_cookie_header = "Set-Cookie: session_id=" + sid + "; Path=/;";
    }

    if (qs.find("action=clear") != std::string::npos) {
        set_cookie_header = "Set-Cookie: session_id=; Path=/; Max-Age=0;";
    }

   
    std::cout << "Cache-Control: no-cache\r\n";
    std::cout << "Content-Type: text/html\r\n";
    if (!set_cookie_header.empty()) {
        std::cout << set_cookie_header << "\r\n";
    }
    std::cout << "\r\n";


    std::cout << R"(<html><head><title>C++ State Demo</title></head><body style="font-family: sans-serif; padding: 20px;">
        <h2>C++ Server-Side State Demo</h2>
        <nav>
        <a href="?">1. Enter Data</a> | 
        <a href="?action=view">2. View Saved Data</a> | 
        <a href="?action=clear">3. Clear Session</a> | 
        <a href="/">home</a>
        </nav><hr>
        )";

    if (qs.find("action=save") != std::string::npos) {
        const char* len_raw = std::getenv("CONTENT_LENGTH");
        int content_length = len_raw ? std::stoi(len_raw) : 0;
        std::string body = "";

        if (content_length > 0) {
            body.resize(content_length);
            std::cin.read(&body[0], content_length);
        }

        size_t prefix_pos = body.find("user_data=");
        std::string parsed_data = (prefix_pos != std::string::npos) ? body.substr(prefix_pos + 10) : body;
        for (char &c : parsed_data) {
            if (c == '+') c = ' ';
        }

        if (!sid.empty()) {
            std::string filepath = "/tmp/cpp_sess_" + sid + ".txt";
            std::ofstream outfile(filepath);
            if (outfile.is_open()) {
                outfile << parsed_data;
                outfile.close();
            }

            std::cout << "<p>Data successfully saved to the server!</p>\n";
            std::cout << "<p><a href=\"?action=view\">Click here to view it on the next screen.</a></p>\n";
        }

    } else if (qs.find("action=view") != std::string::npos) {
        if (!sid.empty()) {
            std::string filepath = "/tmp/cpp_sess_" + sid + ".txt";
            std::ifstream infile(filepath);
            if (infile.is_open()) {
                std::stringstream buffer;
                buffer << infile.rdbuf();
                std::string data = buffer.str();
                infile.close();

                std::cout << "<p><strong>Data retrieved from server file:</strong></p>\n";
                std::cout << "<blockquote style=\"background: #f0f0f0; padding: 10px;\">" << data << "</blockquote>\n";
            } else {
                std::cout << "<p>Session is active, but no data file was found. Did you save data yet?</p>\n";
            }
        } else {
            std::cout << "<p>No active session. Please go to the Enter Data screen.</p>\n";
        }

    } else if (qs.find("action=clear") != std::string::npos) {
        if (!sid.empty()) {
            std::string filepath = "/tmp/cpp_sess_" + sid + ".txt";
            std::remove(filepath.c_str());
        }
        std::cout << "<p>Session cleared and server data file deleted.</p>\n";

    } else {
        std::cout << R"(
        <form method="POST" action="?action=save">
            <label><strong>Enter some text to save on the server:</strong></label><br><br>
            <input type="text" name="user_data" required style="padding: 5px; width: 300px;">
            <button type="submit" style="padding: 5px 10px;">Save Data</button>
        </form>
        )";
    }

    std::cout << "</body></html>\n";
    return 0;
}