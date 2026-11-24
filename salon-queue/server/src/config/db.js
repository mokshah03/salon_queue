import mongoose from 'mongoose';

let listening = false;

export async function connectDB(uri) {
  mongoose.set('strictQuery', true);
  if (!listening) {
    listening = true;
    mongoose.connection.on('disconnected', () => console.warn('MongoDB disconnected - the driver will keep retrying.'));
    mongoose.connection.on('reconnected', () => console.log('MongoDB reconnected.'));
  }
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  const { host, port, name } = mongoose.connection;
  console.log(`MongoDB connected: ${host}:${port}/${name}`);
}

export async function disconnectDB() {
  await mongoose.disconnect();
}
