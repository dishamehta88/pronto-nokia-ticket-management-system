// Simple front-end login (demo users). See README -> "Known limitations".
const users = [
    { email: "admin@pronto.com", password: "Admin123" },
    { email: "shubham@pronto.com", password: "shubham123" },
    { email: "tl@pronto.com", password: "tl123" },
    { email: "disha@pronto.com", password: "disha123" }
];

// already logged in? go straight to the app
if (localStorage.getItem("loggedInUser")) {
    location.replace("/");
}

document.getElementById("loginForm").addEventListener("submit", function (e) {
    e.preventDefault();

    const email = document.getElementById("email").value.trim().toLowerCase();
    const password = document.getElementById("password").value.trim();
    const errorEl = document.getElementById("errorMessage");

    const user = users.find((u) => u.email === email && u.password === password);

    if (user) {
        localStorage.setItem("loggedInUser", user.email);
        location.href = "/";
    } else {
        errorEl.textContent = "Invalid email or password";
    }
});
