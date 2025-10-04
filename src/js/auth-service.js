// Auth Service - Simple user authentication (client-side)
class AuthService {
  static USERS_KEY = 'closet_users';
  static CURRENT_USER_KEY = 'closet_current_user';
  static DEFAULT_USER = {
    id: "user_harrison_1",
    username: "harrisonkenned291@gmail.com",
    password: "closet2025",
    createdAt: new Date().toISOString()
  };

  static initializeDefaultUser() {
    const users = this.getUsers();

    // Check if default user already exists
    if (!users.find(u => u.username === this.DEFAULT_USER.username)) {
      users.push(this.DEFAULT_USER);
      localStorage.setItem(this.USERS_KEY, JSON.stringify(users));
      console.log(`✅ Pre-created user: ${this.DEFAULT_USER.username}`);
      return true;
    }
    return false;
  }

  static getCurrentUser() {
    const userJson = localStorage.getItem(this.CURRENT_USER_KEY);
    return userJson ? JSON.parse(userJson) : null;
  }

  static isLoggedIn() {
    return this.getCurrentUser() !== null;
  }

  static register(username, password) {
    if (!username || !password) {
      return { success: false, error: 'Username and password required' };
    }

    // Get existing users
    const users = this.getUsers();

    // Check if username exists
    if (users.find(u => u.username === username)) {
      return { success: false, error: 'Username already exists' };
    }

    // Create new user
    const newUser = {
      id: Date.now().toString(),
      username: username,
      password: password, // In production, this would be hashed
      createdAt: new Date().toISOString()
    };

    users.push(newUser);
    localStorage.setItem(this.USERS_KEY, JSON.stringify(users));

    return { success: true, user: { id: newUser.id, username: newUser.username } };
  }

  static login(username, password) {
    const users = this.getUsers();
    const user = users.find(u => u.username === username && u.password === password);

    if (!user) {
      return { success: false, error: 'Invalid username or password' };
    }

    // Set current user
    const currentUser = { id: user.id, username: user.username };
    localStorage.setItem(this.CURRENT_USER_KEY, JSON.stringify(currentUser));

    return { success: true, user: currentUser };
  }

  static logout() {
    localStorage.removeItem(this.CURRENT_USER_KEY);
    return { success: true };
  }

  static getUsers() {
    const usersJson = localStorage.getItem(this.USERS_KEY);
    return usersJson ? JSON.parse(usersJson) : [];
  }

  static getUserStorageKey(userId) {
    return `resellerClosetItems_${userId}`;
  }

  static getCurrentUserStorageKey() {
    const user = this.getCurrentUser();
    return user ? this.getUserStorageKey(user.id) : 'resellerClosetItems';
  }
}
