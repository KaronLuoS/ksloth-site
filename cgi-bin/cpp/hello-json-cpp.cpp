#include <iostream>
#include <cstdlib>
#include <chrono>
#include <ctime>
#include <iomanip>
#include <sstream>
#include <string>

int main() {
    std::cout << "Cache-Control: no-cache\r\n";
    std::cout << "Content-Type: application/json\r\n";
    std::cout << "\r\n";

    auto now = std::chrono::system_clock::now();
    std::time_t time = std::chrono::system_clock::to_time_t(now);
    std::tm* local_time = std::localtime(&time);

    std::ostringstream date;
    date << std::put_time(local_time, "%Y-%m-%d %H:%M:%S");

    const char* remote_addr = std::getenv("REMOTE_ADDR");
    std::string address = remote_addr ? remote_addr : "Unknown IP";

    std::cout << R"({
    "title": "Hello, there!",
    "heading": "Hello, C++!",
    "message": "This page was generated with the C++ programming language and Karon wrote the code",
    "time": ")" << date.str() << R"(",
    "IP": ")" << address << R"("
})";

    return 0;
}