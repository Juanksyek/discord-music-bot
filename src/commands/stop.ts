import queueManager from './queueManager';

export async function stopMusic() {
    queueManager.stop();
}