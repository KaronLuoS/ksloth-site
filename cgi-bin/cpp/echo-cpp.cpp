#include <iostream>
#include <cstdlib>
#include <chrono>
#include <ctime>
#include <iomanip>
#include <sstream>
#include <string>

int main() {
    std::cout << "Cache-Control: no-cache\r\n";
    std::cout << "Content-Type: text/html\r\n";
    std::cout << "\r\n";


    const char* request_method = std::getenv("REQUEST_METHOD");
    std::string method = request_method ? request_method:"UNKNOWN";
    const char* http_host = std::getenv("HTTP_HOST");
    const char* server_name = std::getenv("SERVER_NAME");
    std::string host = http_host ? http_host: server_name? server_name :"Unknown Host";
    const char* http_agent = std::getenv("HTTP_USER_AGENT");
    std::string user_agent = http_agent ? http_agent : "Unknown Agent";
    const char* remote_addr = std::getenv("REMOTE_ADDR");
    std::string address = remote_addr ? remote_addr : "Unknown IP";

    auto now = std::chrono::system_clock::now();
    std::time_t time = std::chrono::system_clock::to_time_t(now);
    std::tm* local_time = std::localtime(&time);

    std::ostringstream date;
    date << std::put_time(local_time, "%Y-%m-%d %H:%M:%S");

    std::string payload = "";

    if(method == "GET"){
        const char* query = std::getenv("QUERY_STRING");
        payload = query ? query : "";
    } 
    else {
        const char* length_str = std::getenv("CONTENT_LENGTH");
        int content_length = length_str ? std::stoi(length_str) : 0;
        
        if (content_length > 0) {
            payload.resize(content_length);
            std::cin.read(&payload[0], content_length);
        }
    }

    std::cout << R"(
    <!DOCTYPE html>
    <html>
    <head>
        <title>C++ Echo Response</title>
    </head>
    <body style="font-family: monospace; padding: 20px;">
        <h2>=== Request Metadata ===</h2>
    )";

    std::cout << "<p><b>Method:</b>"<< method<< "</p>\n";
    std::cout << "<p><b>Hostname:</b>" << host << "</p>\n";
    std::cout << "<p><b>Time:</b>" << date.str() << "</p>\n";
    std::cout << "<p><b>User Agent:</b>" << user_agent << "</p>\n";
    std::cout << "<p><b>IP Address:</b>" << address << "</p>\n";
    
    std::cout << "<h2>=== Received Data ===</h2>\n";
    if (payload.empty()) {
        std::cout << "<p>(No data received)</p>\n";
    } else {
        std::cout << "<pre style='background: #f0f0f0; padding: 10px;'>"<< payload<< "</pre>\n";
    }

    std::cout << "</body>\n"<< "</html>\n";
    
    return 0;
}