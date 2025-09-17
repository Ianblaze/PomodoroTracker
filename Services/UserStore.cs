using System.Collections.Concurrent;

namespace PomodoroTracker.Services
{
    public class UserStore
    {
        // email → password
        private readonly ConcurrentDictionary<string, string> _users = new();

        public bool Register(string email, string password)
        {
            return _users.TryAdd(email.ToLower(), password);
        }

        public bool Validate(string email, string password)
        {
            return _users.TryGetValue(email.ToLower(), out var stored) && stored == password;
        }
    }
}

