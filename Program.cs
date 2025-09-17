using Microsoft.AspNetCore.Authentication.Cookies;
using PomodoroTracker.Services; // add this

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddRazorPages();

// add in-memory user store as a singleton
builder.Services.AddSingleton<UserStore>();

builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(options =>
    {
        options.LoginPath = "/Account/Login";
        options.LogoutPath = "/Account/Logout";
    });

var app = builder.Build();

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Error");
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseStaticFiles();
app.UseRouting();

app.UseAuthentication();
app.UseAuthorization();

// if not logged in, redirect "/" → "/Account/Register"
app.MapGet("/", (HttpContext ctx) =>
{
    if (ctx.User.Identity?.IsAuthenticated ?? false)
        return Results.Redirect("/Index");
    else
        return Results.Redirect("/Account/Register");
});

app.MapRazorPages();
app.Run();


