import MyTimeTracker from '../components/MyTimeTracker';

export default function MyActivity() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">My Activity</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Your time tracked across projects — view it day, week, or month.
        </p>
      </div>
      <MyTimeTracker />
    </div>
  );
}
