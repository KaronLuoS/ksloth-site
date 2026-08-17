#include <iostream>
#include <cstdlib>
#include <string>

int main() {
    std::cout << "Cache-Control: no-cache\r\n";
    std::cout << "Content-Type: text/html\r\n";
    std::cout << "\r\n";

    std::cout << R"(
    <!DOCTYPE html>
    <html>
    <head>
        <title>Environment Variables</title>
    </head>
    <body>
    <h1 align="center">Environment Variables with CPP :)</h1>
    <hr>
    )";

    extern char **environ;
    for (char **env = environ; *env != nullptr; env++) {
        std::string entry(*env);
        std::cout << "        <li>" << entry << "</li>\n";
    }

    std::cout << R"(
    </body>
    </html>
    )";
    
    return 0;
}