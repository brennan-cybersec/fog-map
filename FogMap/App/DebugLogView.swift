import ExplorationStore
import LocationEngine
import SwiftUI

/// The debug screen Build Spec section 6 asks for: tier transitions and time
/// spent per tier, so a multi-day run can be checked against the battery targets
/// before anything else in the app gets built.
@MainActor
final class DebugLogViewModel: ObservableObject {
    @Published var currentTier: LocationTier = .dormant
    @Published var timeInDormant: TimeInterval = 0
    @Published var timeInApproaching: TimeInterval = 0
    @Published var timeInExploring: TimeInterval = 0
    @Published var transitions: [TierTransition] = []
    @Published var exploredCellCount: Int = 0

    private let engine: LocationEngine
    private let store: ExplorationStore
    private var refreshTask: Task<Void, Never>?

    init(engine: LocationEngine, store: ExplorationStore) {
        self.engine = engine
        self.store = store
    }

    func startRefreshing() {
        refreshTask?.cancel()
        refreshTask = Task { [weak self] in
            while let self, !Task.isCancelled {
                await self.refresh()
                try? await Task.sleep(nanoseconds: 2_000_000_000)
            }
        }
    }

    func stopRefreshing() {
        refreshTask?.cancel()
    }

    private func refresh() async {
        let log = engine.eventLog
        currentTier = engine.tier
        timeInDormant = await log.timeSpent(in: .dormant)
        timeInApproaching = await log.timeSpent(in: .approaching)
        timeInExploring = await log.timeSpent(in: .exploring)
        transitions = await log.recentTransitions(limit: 100)
        exploredCellCount = store.exploredCellCount()
    }
}

struct DebugLogView: View {
    @StateObject var viewModel: DebugLogViewModel

    private static let durationFormatter: DateComponentsFormatter = {
        let formatter = DateComponentsFormatter()
        formatter.allowedUnits = [.hour, .minute, .second]
        formatter.unitsStyle = .abbreviated
        return formatter
    }()

    var body: some View {
        List {
            Section("Current tier") {
                Text(viewModel.currentTier.description.capitalized)
                    .font(.title2.bold())
            }

            Section("Time in tier") {
                row(label: "Dormant", value: viewModel.timeInDormant)
                row(label: "Approaching", value: viewModel.timeInApproaching)
                row(label: "Exploring", value: viewModel.timeInExploring)
            }

            Section("Exploration") {
                LabeledContent("Cells discovered", value: "\(viewModel.exploredCellCount)")
            }

            Section("Recent transitions") {
                ForEach(viewModel.transitions) { transition in
                    VStack(alignment: .leading, spacing: 2) {
                        Text("\(transition.from.description) → \(transition.to.description)")
                            .font(.subheadline.bold())
                        Text(transition.reason)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Text(transition.timestamp.formatted(date: .abbreviated, time: .standard))
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                    }
                }
            }
        }
        .navigationTitle("Tracking Debug")
        .task {
            viewModel.startRefreshing()
        }
        .onDisappear {
            viewModel.stopRefreshing()
        }
    }

    private func row(label: String, value: TimeInterval) -> some View {
        LabeledContent(label, value: Self.durationFormatter.string(from: value) ?? "0s")
    }
}
