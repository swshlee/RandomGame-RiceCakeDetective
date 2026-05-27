const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const port = Number(process.argv[2] || 4191);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url, `http://127.0.0.1:${port}`);
  const safePath = path.normalize(decodeURIComponent(requestUrl.pathname)).replace(/^[/\\]+/, "");
  const filePath = path.join(root, safePath || "index.html");

  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Type": types[path.extname(filePath).toLowerCase()] || "application/octet-stream",
    });
    response.end(data);
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`RiceCakeDetective server running at http://127.0.0.1:${port}/`);
});
